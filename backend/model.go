package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

type Flag struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Key          string    `json:"key"`
	Environment  string    `json:"environment"`
	Description  string    `json:"description"`
	Enabled      bool      `json:"enabled"`
	DefaultValue bool      `json:"default_value"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
type Rule struct {
	ID        int64           `json:"id"`
	FlagID    int64           `json:"flag_id"`
	Attribute string          `json:"attribute"`
	Operator  string          `json:"operator"`
	Expected  json.RawMessage `json:"expected"`
	Result    bool            `json:"result"`
	Priority  int             `json:"priority"`
}
type History struct {
	ID        int64           `json:"id"`
	Action    string          `json:"action"`
	Actor     string          `json:"actor"`
	Summary   string          `json:"summary"`
	Changes   json.RawMessage `json:"changes"`
	CreatedAt time.Time       `json:"created_at"`
}
type Detail struct {
	Flag    Flag      `json:"flag"`
	Rules   []Rule    `json:"rules"`
	History []History `json:"history"`
}
type FlagInput struct {
	Name         string `json:"name"`
	Key          string `json:"key"`
	Environment  string `json:"environment"`
	Description  string `json:"description"`
	Enabled      *bool  `json:"enabled"`
	DefaultValue *bool  `json:"default_value"`
}

var keyPattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,63}$`)
var attributePattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.-]{0,63}$`)

func validEnvironment(s string) bool {
	return s == "development" || s == "staging" || s == "production"
}
func (v *FlagInput) validate() error {
	v.Name = strings.TrimSpace(v.Name)
	if v.Name == "" || utf8.RuneCountInString(v.Name) > 100 {
		return errors.New("名称须为 1～100 个字符")
	}
	if !keyPattern.MatchString(v.Key) {
		return errors.New("Key 须以小写字母开头，包含小写字母、数字、下划线或短横线，最长 64 位")
	}
	if !validEnvironment(v.Environment) {
		return errors.New("环境须为 development、staging 或 production")
	}
	if utf8.RuneCountInString(v.Description) > 500 {
		return errors.New("描述不能超过 500 个字符")
	}
	if v.Enabled == nil || v.DefaultValue == nil {
		return errors.New("enabled 和 default_value 必须为布尔值")
	}
	return nil
}

type RuleInput struct {
	Attribute string          `json:"attribute"`
	Operator  string          `json:"operator"`
	Expected  json.RawMessage `json:"expected"`
	Result    *bool           `json:"result"`
	Priority  *int            `json:"priority"`
}

func parseValue(raw json.RawMessage) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	err := dec.Decode(&v)
	return v, err
}
func scalar(v any) bool {
	switch v.(type) {
	case string, bool, json.Number:
		return true
	}
	return false
}
func (v RuleInput) validate() error {
	if !attributePattern.MatchString(v.Attribute) {
		return errors.New("属性名须以字母或下划线开头，仅含字母、数字、下划线、点或短横线，最长 64 位")
	}
	if v.Priority == nil || *v.Priority < 0 || *v.Priority > 1000000 {
		return errors.New("优先级须为 0～1000000 的整数，数字越小越先匹配，且不能重复")
	}
	if v.Result == nil {
		return errors.New("规则返回值须为布尔值")
	}
	expected, err := parseValue(v.Expected)
	if err != nil {
		return errors.New("期望值必须是合法 JSON")
	}
	switch v.Operator {
	case "equals":
		if !scalar(expected) {
			return errors.New("equals 的期望值只能是 JSON 字符串、数字或布尔值")
		}
	case "in":
		arr, ok := expected.([]any)
		if !ok || len(arr) == 0 || len(arr) > 100 {
			return errors.New("in 的期望值必须是含 1～100 项的 JSON 数组")
		}
		for _, x := range arr {
			if !scalar(x) {
				return errors.New("in 数组中的每一项只能是字符串、数字或布尔值")
			}
		}
	default:
		return errors.New("操作符只支持 equals 或 in")
	}
	return nil
}
func equalScalar(a, b any) bool {
	switch x := a.(type) {
	case string:
		y, ok := b.(string)
		return ok && x == y
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case json.Number:
		y, ok := b.(json.Number)
		if !ok {
			return false
		}
		ax, ok1 := new(big.Rat).SetString(string(x))
		by, ok2 := new(big.Rat).SetString(string(y))
		return ok1 && ok2 && ax.Cmp(by) == 0
	}
	return false
}

type Step struct {
	RuleID   int64 `json:"rule_id"`
	Priority int   `json:"priority"`
	Matched  bool  `json:"matched"`
}
type Evaluation struct {
	Value       bool   `json:"value"`
	Matched     bool   `json:"matched"`
	Reason      string `json:"reason"`
	Explanation string `json:"explanation"`
	MatchedRule *Rule  `json:"matched_rule"`
	Steps       []Step `json:"steps"`
}

func evaluate(flag Flag, rules []Rule, attrs map[string]any) Evaluation {
	out := Evaluation{Value: flag.DefaultValue, Reason: "default", Explanation: "没有规则命中，使用 Flag 默认值", Steps: []Step{}}
	if !flag.Enabled {
		out.Value = false
		out.Reason = "disabled"
		out.Explanation = "Flag 已停用，直接返回 false，不计算规则或默认值"
		return out
	}
	ordered := append([]Rule(nil), rules...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Priority < ordered[j].Priority })
	for _, r := range ordered {
		actual, exists := attrs[r.Attribute]
		expected, _ := parseValue(r.Expected)
		matched := false
		if exists && scalar(actual) {
			if r.Operator == "equals" {
				matched = equalScalar(actual, expected)
			}
			if r.Operator == "in" {
				if arr, ok := expected.([]any); ok {
					for _, x := range arr {
						if equalScalar(actual, x) {
							matched = true
							break
						}
					}
				}
			}
		}
		out.Steps = append(out.Steps, Step{r.ID, r.Priority, matched})
		if matched {
			out.Value = r.Result
			out.Matched = true
			out.Reason = "rule"
			out.MatchedRule = &r
			out.Explanation = fmt.Sprintf("命中规则 #%d（优先级 %d），停止后续匹配", r.ID, r.Priority)
			return out
		}
	}
	return out
}
