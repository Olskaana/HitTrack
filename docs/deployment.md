# Guia de execução local e publicação opcional

Hospedagem pública não é requisito deste projeto conforme alinhamento da disciplina. Este guia permite executar e demonstrar o HitTrack localmente; as notas de publicação abaixo são apenas referência para uma eventual implantação futura.

## Limites para uma eventual publicação

O backend importa `detector.CamWorker` durante a inicialização. O módulo, os dados e os pesos pertencem ao projeto **separado** `hitcount-ia`, que não está versionado neste repositório. Portanto, instalar os requisitos do HitTrack sozinho não produz uma API executável, e esta documentação não inclui nem copia o projeto de IA.

Além disso, o frontend usa a URL local `http://127.0.0.1:8000`, a API ainda não possui autenticação, o CORS é amplo e vídeos usam armazenamento local. **Não publique esta configuração na Internet como está.** Um deploy público exige primeiro decidir e provisionar detector/compute, URL de API no frontend, CORS restrito, autenticação, HTTPS, armazenamento persistente compartilhado e proteção do endpoint operacional `/metrics`.

Este guia descreve uma execução local e o checklist genérico para um futuro host. Nenhum serviço de hospedagem é criado aqui.

## Pré-requisitos para execução local

- Windows PowerShell, Python 3.12 e Node.js 22.
- Clone do HitTrack e clone já existente do `hitcount-ia`, em diretórios acessíveis pelo backend.
- Arquivos do detector e respectivos pesos/dados disponíveis no clone externo.
- Configuração correta de `AI_PROJECT_DIR`; o default esperado é `hitcount-ia` ao lado da raiz HitTrack.

Instale dependências e configure o ambiente:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
```

Edite `backend/.env`, ajuste `AI_PROJECT_DIR` para o caminho absoluto do clone externo e configure `DATABASE_URL` para uma instância PostgreSQL acessível. Crie previamente o banco e o usuário definidos na URL; o exemplo usa `localhost:5432/hittrack`. A aplicação não inicia sem `DATABASE_URL`.

Inicie a API a partir da raiz:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Em outro terminal, instale e inicie o frontend:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Abra `http://localhost:5173`. A documentação interativa da API fica em `http://127.0.0.1:8000/docs`; métricas operacionais ficam em `http://127.0.0.1:8000/metrics`.

## Deploy genérico: checklist para a plataforma escolhida

Antes de escolher Render, Railway ou outra plataforma, defina e teste:

1. **Detector:** forneça o módulo Python, dependências, pesos e dados sem depender de um caminho local implícito. Configure `AI_PROJECT_DIR` ou documente o mecanismo escolhido, sem commitar pesos ou credenciais.
2. **Builds independentes:** publique o backend Python e os arquivos estáticos do frontend em serviços adequados. Configure no build do frontend a origem HTTPS da API; o endpoint local não serve para produção.
3. **Banco:** configure `DATABASE_URL` com um banco gerenciado. Teste inicialização e migrações em ambiente descartável.
4. **Vídeos:** use volume persistente ou object storage. Confirme se workers e API compartilham os mesmos arquivos.
5. **Segurança:** implemente autenticação/autorização, restrinja CORS ao frontend, limite uploads, habilite HTTPS e restrinja acesso ao endpoint `/metrics`. Armazene chaves e senhas em secret manager.
6. **Observabilidade:** configure um scraper Prometheus alcançando a API somente pela rede privada e direcione Grafana a esse Prometheus.
7. **Verificação:** rode os checks de `.github/workflows/ci.yml`, teste upload, importação, métricas e análise, e confirme backups/retention antes da publicação.

Esses pré-requisitos não são automaticamente resolvidos por este repositório. Não faça deploy público enquanto os controles de segurança e a dependência externa não estiverem operacionais.

## Testes locais

Veja [README.md](../README.md#testes-e-cobertura) para executar os testes e os limites mínimos. Consulte [`monitoring/README.md`](../monitoring/README.md) para subir e encerrar a stack local de monitoramento.
