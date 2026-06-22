# ⚔️ HitTrack
### Plataforma de Análise de Desempenho para Robôs de Combate Baseada em Inteligência Artificial

> Transformando contagem de hits em inteligência tática para equipes de combate de robôs.

---

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![Node.js](https://img.shields.io/badge/backend-Node.js-green)
![React](https://img.shields.io/badge/frontend-React-blue)
![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL-blue)
![License](https://img.shields.io/badge/license-Academic-lightgrey)

## 📌 Sobre o Projeto

**HitTrack** é uma aplicação web analítica que processa dados de hits (golpes efetivos) produzidos por um sistema de inteligência artificial de visão computacional, gerando indicadores táticos de desempenho para dois robôs de combate.

O problema central abordado é: **como ir além do resultado (vitória/derrota)?** Robôs podem vencer por margem estreita ou perder com desempenho ofensivo superior. A simples observação visual não captura padrões de agressividade, consistência ou eficiência ao longo do combate — o HitTrack preenche essa lacuna.

Este projeto é desenvolvido como portfólio acadêmico na **Universidade Católica de Santa Catarina**, na linha de projetos **Web Apps** do PAC 8 (2026/2).

**Autora:** Ana Maria Olska

---

## 🎯 Hipótese

> A contagem de hits, analisada por métricas como eficiência (hits/min), eficácia (hits/vitória e hits/derrota), consistência (desvio padrão) e correlação com ELO, revela padrões de desempenho e perfis táticos que não são evidentes apenas pelos resultados finais.

---

## ✨ Funcionalidades

### Fluxos de Negócio Principais

**1. Ingestão e Organização de Dados**
Consumo de dados brutos produzidos pela IA de visão computacional, armazenando séries temporais de contagens de hits por segundo, por robô e por luta.

**2. Cálculo de Métricas Estatísticas**
Para cada luta e robô, o sistema calcula:
- **Eficiência** — hits por minuto
- **Eficácia** — hits por vitória e hits por derrota
- **Consistência** — desvio padrão de hits por luta
- **Perfil temporal** — distribuição percentual por terço de luta
- **Correlação com ELO** — coeficiente de Pearson ou Spearman

**3. Dashboard Interativo**
Painel com gráficos de dispersão, histogramas e tabelas comparativas entre os dois robôs, com filtros por período e tipo de competição.

### Funcionalidades Complementares
- Autenticação com JWT e perfis de acesso (analista e administrador)
- Exportação de relatórios
- Interface responsiva e modular
- Feedback visual ao usuário (carregamento, erros e confirmações)

---

## 🏗️ Arquitetura

O sistema adota arquitetura **cliente-servidor em camadas (MVC)**, documentada em modelo C4.

```
┌─────────────────────────────────────────────────┐
│               Camada de Apresentação             │
│           React.js + Chart.js (SPA)              │
└────────────────────┬────────────────────────────┘
                     │ HTTP/REST
┌────────────────────▼────────────────────────────┐
│               Camada de Aplicação                │
│         Node.js + Express (API REST)             │
│    rotas → controladores → serviços → repos      │
└────────────────────┬────────────────────────────┘
                     │ Prisma ORM
┌────────────────────▼────────────────────────────┐
│               Camada de Dados                    │
│    PostgreSQL (lutas, hits temporais, ELO)       │
└─────────────────────────────────────────────────┘

Infraestrutura: Docker · GitHub Actions · SonarCloud · Prometheus + Grafana
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React.js + Chart.js + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Banco de Dados | PostgreSQL + Prisma ORM |
| Testes | Jest / Vitest (TDD) |
| CI/CD | GitHub Actions |
| Análise Estática | SonarCloud |
| Monitoramento | Prometheus + Grafana |
| Deploy | Docker → Render ou Railway |
| Segurança | HTTPS, JWT, proteção contra XSS/CSRF |

---

## 🔬 Contexto de Pesquisa

### Problema
Equipes de combate de robôs tomam decisões estratégicas baseadas apenas em observação visual ou resultado final. Não existe, no mercado, uma ferramenta que integre extração automática de hits por IA com geração de indicadores táticos voltados especificamente para combate de robôs.

### Diferencial
Ferramentas como Tableau e Mobalytics focam em visualização de dados previamente processados. O HitTrack **correlaciona cada hit temporal à eficiência, eficácia e perfil de luta**, transformando dados brutos em indicadores gerenciais acionáveis para equipes e competidores no combate de robôs.

| Característica | Artigos acadêmicos | Mobalytics | Tableau / Bold BI | HitTrack |
|---|:---:|:---:|:---:|:---:|
| Contagem automática de hits | Parcial | ✗ | ✗ | ✅ |
| Uso de IA / Visão Computacional | ✅ | Parcial | ✗ | ✅ |
| Geração de insights táticos | Parcial | ✅ | ✅ | ✅ |

---

## 📈 Resultados Esperados

Ao final do projeto espera-se disponibilizar uma aplicação web capaz de:

- Analisar automaticamente dados de hits gerados por IA;
- Calcular métricas de eficiência, eficácia e consistência;
- Identificar perfis de luta dos robôs analisados;
- Correlacionar desempenho ofensivo com rating ELO;
- Disponibilizar dashboards interativos para apoio à decisão;
- Validar o uso de dados produzidos por IA em análises competitivas de robótica de combate.

O objetivo é transformar dados brutos em informações estratégicas que auxiliem equipes no desenvolvimento e evolução de seus robôs.

## 📋 Requisitos da Linha Web Apps

| Requisito | Como atendido |
|---|---|
| Hospedagem pública | Deploy em Render ou Railway com URL acessível via HTTPS |
| Funcionalidades reais (RFC) | 3 fluxos completos: ingestão, cálculo de métricas, dashboard |
| Arquitetura definida | Cliente-servidor MVC documentada em C4 |
| Repositório Git + CI/CD | GitHub com histórico de commits + GitHub Actions |
| Documentação mínima | RFC, casos de uso, diagrama C4 e guia de deploy |
| Testes unitários (TDD) | 75% backend e 25% frontend com Jest/Vitest |
| Análise estática | SonarCloud integrado ao pipeline |
| Monitoramento | Prometheus + Grafana |
| ≥ 3 fluxos de negócio | Ingestão de hits · Cálculo de métricas · Dashboard |

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
