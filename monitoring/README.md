# Monitoramento local

O compose deste diretório sobe somente Prometheus e Grafana. A API HitTrack é iniciada separadamente no host com o detector configurado; o Prometheus a alcança por `host.docker.internal:8000`. Essa stack é local e não configura monitoramento para um deploy público.

1. Inicie a API segundo [`docs/deployment.md`](../docs/deployment.md) e confirme que `http://127.0.0.1:8000/metrics` responde.
2. Na raiz do repositório, defina uma senha local do Grafana no terminal atual:

```powershell
$env:GRAFANA_ADMIN_PASSWORD = Read-Host "Senha local do Grafana"
docker compose -f monitoring/docker-compose.yml up -d
```

3. Abra Prometheus em `http://localhost:9090` e confirme o target `hittrack-api` como `UP`.
4. Abra Grafana em `http://localhost:3000`, entre como `admin` com a senha definida no passo 2 e abra a pasta **HitTrack** / dashboard **HitTrack - API**.
5. Para encerrar: `docker compose -f monitoring/docker-compose.yml down`. Para também remover os históricos e dados persistidos do Prometheus/Grafana, use `docker compose -f monitoring/docker-compose.yml down -v`.

O dashboard apresenta taxa de requisições, latência p95, respostas HTTP e requisições em andamento. Os volumes persistentes mantêm históricos/dashboards do Grafana entre reinicializações. As portas são vinculadas somente ao loopback local; não altere esse bind para uma interface pública sem implementar controles de acesso.
