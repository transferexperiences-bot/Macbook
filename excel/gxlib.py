import json, subprocess, time
def gx(metodo, percorso, corpo=None):
    b = json.dumps({"metodo": metodo, "percorso": percorso, "corpo": corpo or {}})
    for t in range(5):
        o = subprocess.run(["curl", "-sS", "-m", "170", "-X", "POST", "https://transfer.app.n8n.cloud/webhook/gx-graph",
                            "-H", "Content-Type: application/json", "-d", "@-"], input=b, capture_output=True, text=True).stdout
        try: r = json.loads(o)
        except Exception: r = {"ok": False, "raw": o[:300]}
        if r.get("ok") and not (r.get("risposta") or {}).get("error"): return r["risposta"]
        # una scrittura si ripete solo se Microsoft ha rifiutato per carico (non e' stata applicata)
        if metodo != "GET" and not any(x in str(r) for x in ("Throttl", "TooMany", "Unavailable", "CannotAcquireLock")): break
        time.sleep(15 * (t + 1))
    raise RuntimeError(f"{metodo} {percorso[:90]}: {str(r)[:400]}")
