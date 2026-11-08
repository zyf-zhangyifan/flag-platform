package main

import (
	"encoding/json"
	"testing"
)

func TestEvaluate(t *testing.T) {
	rules := []Rule{
		{ID: 2, Attribute: "country", Operator: "in", Expected: json.RawMessage(`["CN","SG"]`), Result: true, Priority: 20},
		{ID: 1, Attribute: "plan", Operator: "equals", Expected: json.RawMessage(`"blocked"`), Result: false, Priority: 10},
	}
	tests := []struct {
		name         string
		enabled, def bool
		attrs        string
		value        bool
		reason       string
		rule         int64
		steps        int
	}{
		{"first matching rule wins including false", true, true, `{"plan":"blocked","country":"CN"}`, false, "rule", 1, 1},
		{"in operator matches", true, false, `{"country":"SG"}`, true, "rule", 2, 2},
		{"default true", true, true, `{"country":"US"}`, true, "default", 0, 2},
		{"default false missing attribute", true, false, `{}`, false, "default", 0, 2},
		{"disabled overrides default and rules", false, true, `{"country":"CN"}`, false, "disabled", 0, 0},
		{"null does not match", true, false, `{"country":null}`, false, "default", 0, 2},
		{"array does not match scalar", true, false, `{"country":["CN"]}`, false, "default", 0, 2},
		{"matching is case sensitive", true, false, `{"country":"cn"}`, false, "default", 0, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			attrs, err := parseValue(json.RawMessage(tt.attrs))
			if err != nil {
				t.Fatal(err)
			}
			got := evaluate(Flag{Enabled: tt.enabled, DefaultValue: tt.def}, rules, attrs.(map[string]any))
			var rule int64
			if got.MatchedRule != nil {
				rule = got.MatchedRule.ID
			}
			if got.Value != tt.value || got.Reason != tt.reason || rule != tt.rule || len(got.Steps) != tt.steps || got.Matched != (tt.rule != 0) {
				t.Fatalf("unexpected result: %+v", got)
			}
		})
	}
	if rules[0].ID != 2 {
		t.Fatal("evaluation must not mutate caller's rule order")
	}
	if got := evaluate(Flag{Enabled: true, DefaultValue: true}, nil, map[string]any{}); !got.Value || got.Reason != "default" {
		t.Fatal(got)
	}
}
func TestTypedEquality(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{`1`, `1.0`, true}, {`1e2`, `100`, true}, {`"1"`, `1`, false}, {`true`, `1`, false}, {`false`, `false`, true},
		{`9007199254740993`, `9007199254740992`, false}, {`null`, `null`, false}, {`{}`, `{}`, false}, {`"CN"`, `"CN"`, true},
	}
	for _, tt := range tests {
		a, _ := parseValue(json.RawMessage(tt.a))
		b, _ := parseValue(json.RawMessage(tt.b))
		if got := equalScalar(a, b); got != tt.want {
			t.Errorf("%s == %s: %v", tt.a, tt.b, got)
		}
	}
}
func TestRuleValidation(t *testing.T) {
	p := 10
	b := true
	tests := []struct {
		op, expected string
		valid        bool
	}{
		{"equals", `"CN"`, true}, {"equals", `5`, true}, {"equals", `false`, true}, {"equals", `null`, false}, {"equals", `[]`, false},
		{"in", `["CN",5,true]`, true}, {"in", `[]`, false}, {"in", `[null]`, false}, {"in", `[{"a":1}]`, false}, {"in", `"CN"`, false},
		{"other", `"CN"`, false}, {"equals", `bad json`, false},
	}
	for _, tt := range tests {
		in := RuleInput{Attribute: "country", Operator: tt.op, Expected: json.RawMessage(tt.expected), Result: &b, Priority: &p}
		if valid := in.validate() == nil; valid != tt.valid {
			t.Errorf("%+v: validity=%v", tt, valid)
		}
	}
	in := RuleInput{Attribute: "", Operator: "equals", Expected: json.RawMessage(`"CN"`), Result: &b, Priority: &p}
	if in.validate() == nil {
		t.Error("empty attribute allowed")
	}
	in.Attribute = "country"
	p = -1
	if in.validate() == nil {
		t.Error("negative priority allowed")
	}
	p = 1000001
	if in.validate() == nil {
		t.Error("oversize priority allowed")
	}
}
func TestFlagValidation(t *testing.T) {
	b := true
	in := FlagInput{Name: " Demo ", Key: "demo_flag", Environment: "production", Enabled: &b, DefaultValue: &b}
	if err := in.validate(); err != nil || in.Name != "Demo" {
		t.Fatal(err, in.Name)
	}
	in.Key = "Invalid Key"
	if in.validate() == nil {
		t.Error("invalid key accepted")
	}
	in.Key = "valid"
	in.Environment = "invalid"
	if in.validate() == nil {
		t.Error("invalid environment accepted")
	}
	in.Environment = "staging"
	in.Enabled = nil
	if in.validate() == nil {
		t.Error("missing enabled accepted")
	}
}
