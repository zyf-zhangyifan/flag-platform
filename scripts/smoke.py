"""Read-only smoke test against a running seeded app: python scripts/smoke.py [base URL]."""
import json
import sys
import urllib.error
import urllib.request

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"


def call(path, payload=None, expected=200):
    body = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(base + path, data=body, headers={"Content-Type": "application/json"})
    try:
        response = urllib.request.urlopen(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read().decode()
        print(json.dumps({"method": request.get_method(), "path": path, "input": payload, "status": response.status, "output": raw}, ensure_ascii=False))
        assert response.status == expected, raw
        return json.loads(raw)


assert call("/api/health")["status"] == "ok"
flags = call("/api/flags?environment=production&q=checkout_v2")
assert len(flags) == 1
for environment, attrs, value, reason in [
    ("production", {"plan": "enterprise", "country": "CN"}, True, "rule"),
    ("production", {"country": "SG"}, True, "rule"),
    ("production", {"country": "US", "plan": "free"}, False, "default"),
    ("staging", {}, True, "default"),
]:
    result = call("/api/evaluate", {"key": "checkout_v2", "environment": environment, "attributes": attrs})
    assert result["value"] is value and result["reason"] == reason
result = call("/api/evaluate", {"key": "smart_search", "environment": "development", "attributes": {}})
assert result["value"] is False and result["reason"] == "disabled" and result["steps"] == []
call("/api/evaluate", {"key": "does_not_exist", "environment": "production", "attributes": {}}, 404)
call("/api/evaluate", {"key": "checkout_v2", "environment": "production", "attributes": None}, 400)
print("PASS: live Go API + PostgreSQL smoke checks")
