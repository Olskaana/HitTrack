# ⚔️ HitTrack
### Plataforma de Análise de Desempenho para Robôs de Combate Baseada em Inteligência Artificial

> Transformando contagem de hits em inteligência tática para equipes de combate de robôs.

---

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![Python](https://img.shields.io/badge/backend-Python-blue)
![React](https://img.shields.io/badge/frontend-React-blue)
![Database](https://img.shields.io/badge/database-PostgreSQL-blue)
![License](https://img.shields.io/badge/license-Academic-lightgrey)

## 📌 Sobre o Projeto

**HitTrack** é uma aplicação web analítica que organiza dados de hits (golpes efetivos), calcula métricas por luta e apresenta indicadores para dois robôs de combate. A detecção automática em vídeo depende de um projeto de IA externo.

O problema central abordado é: **como ir além do resultado (vitória/derrota)?** Robôs podem vencer por margem estreita ou perder com desempenho ofensivo superior. A simples observação visual não captura padrões de agressividade, consistência ou eficiência ao longo do combate — o HitTrack preenche essa lacuna.

Este projeto é desenvolvido como portfólio acadêmico na **Universidade Católica de Santa Catarina**, na linha de projetos **Web Apps** do PAC 8 (2026/2).

**Autora:** Ana Maria Olska

---

## 🎯 Hipótese

> A hipótese de pesquisa é que métricas de hits possam revelar padrões de desempenho e perfis táticos além do resultado final. A validação de eficácia entre lutas, consistência e correlação com ELO depende de funcionalidades futuras.

---

## ✨ Funcionalidades

### Fluxos de Negócio Principais

**1. Ingestão e Organização de Dados**
Consumo de dados brutos produzidos pela IA de visão computacional, armazenando séries temporais de contagens de hits por segundo, por robô e por luta.

**2. Cálculo de Métricas**
Para uma luta, o backend calcula hits por robô, hits por minuto e contagem de hits em cada terço do vídeo. Métricas agregadas de vitórias, consistência e correlação com ELO são objetivos futuros, não funcionalidades implementadas.

**3. Dashboard**
O frontend apresenta as métricas da luta, compara os dois robôs e permite consultar e filtrar o histórico por nome de robô e equipe.

### Funcionalidades Complementares
- Cadastro de luta e envio de vídeo; importação de eventos de hit via API
- Análise de vídeo pelo detector externo, quando `hitcount-ia` está configurado
- Interface responsiva, com estados de carregamento e indisponibilidade da API

---

## 🏗️ Arquitetura

O HitTrack usa arquitetura cliente-servidor em camadas. As rotas FastAPI recebem requisições e coordenam os casos de uso; os módulos de domínio calculam métricas; SQLAlchemy e os modelos persistem lutas e hits. O React consome a API REST. Não há uma camada MVC formal separada: responsabilidades de controller ficam nas rotas. O detector é uma dependência externa configurada por `AI_PROJECT_DIR`.

Os diagramas C4, decisões técnicas e limites atuais estão em [`docs/architecture/`](docs/architecture/); requisitos e fluxos estão em [`docs/RFC.md`](docs/RFC.md) e [`docs/use-cases.md`](docs/use-cases.md).

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite |
| Backend | Python + FastAPI + SQLAlchemy |
| Banco de Dados | PostgreSQL via SQLAlchemy |
| Testes | pytest + pytest-cov / Vitest |
| CI | GitHub Actions (testes, cobertura, lint e build) |
| Análise Estática | SonarCloud (ativada após configurar Secrets/Variables) |
| Monitoramento | Métricas Prometheus e dashboard provisionado do Grafana |
| Execução | Guia de execução local em [`docs/deployment.md`](docs/deployment.md); publicação é opcional |
| Segurança | Sem autenticação; não exponha a API publicamente antes de adicionar controle de acesso e restringir CORS |

---

## 🧪 Testes e cobertura

Os testes cobrem somente o código deste repositório: backend em `backend/` e frontend em `frontend/`. O projeto `hitcount-ia/` não faz parte da suíte nem do cálculo de cobertura; integrações com o detector são substituídas por dublês nos testes.

### Backend

Na raiz do repositório, configure PostgreSQL em `backend/.env` usando [`backend/.env.example`](backend/.env.example), instale as dependências e execute:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m pytest
```

O pytest-cov mede a cobertura dos módulos do HitTrack e exige mínimo de 75%. O relatório XML usado pelo CI/SonarCloud pode ser gerado com `.\.venv\Scripts\python.exe -m pytest --cov-report=xml:coverage.xml`.

### Frontend

Na pasta `frontend/`, instale as dependências e execute os testes com cobertura:

```powershell
npm ci
npm run test:coverage
```

O Vitest exige mínimo de 25% em linhas, instruções, funções e branches. Para executar em modo interativo, use `npm run test:watch`. Os testes e relatórios não incluem `hitcount-ia`.

### CI e SonarCloud

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) valida testes/cobertura do backend, testes/cobertura, lint e build do frontend. Para ativar o job SonarCloud, configure no repositório GitHub as Actions Variables `SONAR_ORGANIZATION` e `SONAR_PROJECT_KEY` e a Actions Secret `SONAR_TOKEN`. A análise exclui o código externo `hitcount-ia`.

### Monitoramento local

Configure `AI_PROJECT_DIR` e inicie a API conforme o guia de deploy. Em seguida defina `GRAFANA_ADMIN_PASSWORD` no terminal e execute `docker compose -f monitoring/docker-compose.yml up -d`. A API expõe métricas em `http://localhost:8000/metrics`, o Prometheus fica em `http://localhost:9090` e o Grafana em `http://localhost:3000`. Detalhes e consultas estão em [`monitoring/README.md`](monitoring/README.md).

---

## 🔬 Contexto de Pesquisa

### Problema
Equipes de combate de robôs tomam decisões estratégicas baseadas apenas em observação visual ou resultado final. Não existe, no mercado, uma ferramenta que integre extração automática de hits por IA com geração de indicadores táticos voltados especificamente para combate de robôs.

### Diferencial
O HitTrack integra ingestão de lutas e hits, cálculo de métricas por luta e visualização em dashboard. Comparações entre várias lutas, eficácia e correlação com ELO permanecem como objetivos futuros.

| Característica | Artigos acadêmicos | Mobalytics | Tableau / Bold BI | HitTrack |
|---|:---:|:---:|:---:|:---:|
| Contagem automática de hits | Parcial | ✗ | ✗ | Condicional* |
| Uso de IA / Visão Computacional | ✅ | Parcial | ✗ | Condicional* |
| Geração de insights táticos | Parcial | ✅ | ✅ | Parcial** |

* A análise automática depende do detector externo `hitcount-ia` configurado no ambiente.
** O dashboard apresenta métricas por luta; análises entre lutas e correlação com ELO não estão implementadas.

## 📈 Resultados Esperados

Os itens abaixo são objetivos acadêmicos; nem todos estão implementados na versão atual:

- Analisar automaticamente dados de hits gerados por IA;
- Calcular métricas de eficiência, eficácia e consistência;
- Identificar perfis de luta dos robôs analisados;
- Correlacionar desempenho ofensivo com rating ELO;
- Ampliar dashboards interativos com métricas agregadas entre lutas;
- Validar o uso de dados produzidos por IA em análises competitivas de robótica de combate.

O objetivo é transformar dados brutos em informações estratégicas que auxiliem equipes no desenvolvimento e evolução de seus robôs. Autenticação, exportação de relatórios e métricas entre múltiplas lutas permanecem fora da implementação atual. Hospedagem pública não é requisito para este projeto.

## 📋 Requisitos da Linha Web Apps

| Requisito | Como atendido |
|---|---|
| Hospedagem pública | Não obrigatória conforme alinhamento da disciplina; a execução local está documentada |
| Funcionalidades reais (RFC) | Ingestão de lutas/vídeos/hits · cálculo de métricas por luta · dashboard/histórico |
| Arquitetura definida | Cliente-servidor em camadas, responsabilidades MVC descritas e diagramas C4 em `docs/architecture/` |
| Repositório Git + CI/CD | GitHub com histórico e workflow CI em `.github/workflows/ci.yml` |
| Documentação mínima | RFC, casos de uso, diagramas C4 e guia de deploy |
| Testes unitários (TDD) | Mais de 75% backend e 25% frontend com pytest/Vitest; limites aplicados na execução |
| Análise estática | Job SonarCloud no workflow, executado após configurar os Secrets/Variables do repositório |
| Monitoramento | Endpoint Prometheus e stack local provisionada de Prometheus + Grafana |
| ≥ 3 fluxos de negócio | Ingestão · cálculo de métricas · consulta do dashboard/histórico |

---

## 📅 Cronograma — PAC 7 (2026/2)

| Atividade | Sem 1–2 | Sem 3–4 | Sem 5–6 | Sem 7–8 | Sem 9–10 | Sem 11–12 | Sem 13–14 | Sem 15–16 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Revisão da literatura e fundamentação | ✓ | ✓ | | | | | | |
| Levantamento e organização dos dados de hits | | ✓ | ✓ | | | | | |
| Definição formal das métricas e fórmulas | | | ✓ | ✓ | | | | |
| Desenvolvimento do backend e banco de dados | | | | ✓ | ✓ | | | |
| Desenvolvimento do frontend / dashboard | | | | | ✓ | ✓ | | |
| Integração com a IA de contagem de hits | | | | | | ✓ | ✓ | |
| Testes unitários (75% back / 25% front) | | | | | | | ✓ | ✓ |
| CI/CD, segurança e monitoramento | | | | | | | ✓ | ✓ |
| Redação e revisão do portfólio final | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Deploy e documentação final | | | | | | | ✓ | ✓ |

---

## ⚠️ Uso de IA

Ferramentas de IA Generativa foram utilizadas na elaboração da documentação textual deste projeto (Claude — Anthropic) para apoio na estruturação de texto e revisão de clareza. Todo o conteúdo técnico, decisões de escopo, hipótese e objetivos foram revisados e validados pela autora, que assume integral responsabilidade pelo trabalho.

---

## 📬 Contato

**Ana Maria Olska**  
Universidade Católica de Santa Catarina  
📍 Jaraguá do Sul, SC — Brasil  
✉️ anamaria.olska@gmail.com

---

*Projeto acadêmico — PAC 8 · Linha Web Apps · 2026/2*
