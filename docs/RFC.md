# RFC-001: fluxos e arquitetura do HitTrack

- **Status:** implementado, com limitações descritas abaixo
- **Escopo:** aplicação deste repositório, sem incorporar o código de `hitcount-ia`
- **Público:** equipes e analistas de robôs de combate

## Contexto

Uma luta reúne dois robôs, dados de identificação, duração, FPS e eventos de hit. O HitTrack mantém os dados da luta, permite importar ou analisar seus eventos, calcula indicadores por robô e apresenta resultados no frontend.

## Decisão

O produto usa uma SPA React/Vite que chama uma API REST FastAPI. Rotas recebem e validam as requisições; modelos SQLAlchemy persistem lutas e hits em PostgreSQL, configurado obrigatoriamente por `DATABASE_URL`; a função `calculate_metrics` implementa os cálculos de uma luta. O detector é externo e é carregado pelo backend a partir de `AI_PROJECT_DIR`.

Responsabilidades MVC são descritas em camadas, não como um MVC estritamente separado: rotas FastAPI desempenham o papel de controller, modelos SQLAlchemy representam os dados e os módulos do backend implementam os cálculos. A interface React é a camada cliente. Os diagramas C4 complementares estão em [`architecture/`](architecture/).

## Fluxos aceitos

### 1. Ingestão

1. Analista registra os dois robôs e parâmetros da luta.
2. Envia um vídeo nos formatos MP4, MOV, AVI ou WEBM, ou importa uma lista JSON de hits.
3. API valida o payload/formato, salva a luta, o arquivo e/ou eventos associados.
4. A análise automática pode ser iniciada com `POST /api/fights/{id}/analyze` se o detector externo estiver configurado. A execução é assíncrona; hits não duplicados são persistidos.

### 2. Cálculo de métricas

`GET /api/fights/{id}/metrics` retorna total de hits, quantidade por robô, hits por minuto e distribuição da quantidade por terço da duração em frames. Aliases configurados na luta são normalizados antes da contagem.

### 3. Consulta e dashboard

O frontend consulta luta, métricas e placar; apresenta comparação, vídeo quando a análise termina e histórico filtrável por robô e equipe. O histórico é fornecido por `GET /api/fights`.

## Contratos principais

| Operação | Endpoint | Resultado |
|---|---|---|
| Cadastrar luta | `POST /api/fights` | Luta validada |
| Listar histórico | `GET /api/fights` | Lutas e totais |
| Ler luta | `GET /api/fights/{id}` | Dados da luta |
| Enviar vídeo | `POST /api/fights/{id}/video` | Arquivo associado |
| Importar hits JSON | `POST /api/fights/{id}/hits` | Eventos validados; duplicatas idênticas por frame/robô são ignoradas |
| Importar arquivo de hits | `POST /api/fights/{id}/hits/upload` | Eventos validados; duplicatas idênticas por frame/robô são ignoradas |
| Calcular métricas | `GET /api/fights/{id}/metrics` | Métricas daquela luta |
| Obter vídeo | `GET /api/fights/{id}/video` | Conteúdo do vídeo |
| Iniciar/interromper análise | `POST /api/fights/{id}/analyze`, `POST /api/fights/{id}/stop` | Estado da análise |
| Coletar métricas operacionais | `GET /metrics` | Exposição Prometheus |

O esquema detalhado dos payloads está em `backend/schemas.py`; as rotas estão em `backend/routers/fights.py` e `backend/main.py`.

## Limites e requisitos externos

- A análise de vídeo depende de `detector.CamWorker`, dos pesos e dos dados providos pelo projeto separado `hitcount-ia`. Esse código não está neste repositório.
- Para importar hits sem executar o detector, use os endpoints de ingestão de eventos.
- As métricas disponíveis são por luta. Eficácia entre vitórias/derrotas, consistência entre lutas e correlação com ELO ainda não foram implementadas.
- O frontend usa `http://127.0.0.1:8000` diretamente e foi configurado para desenvolvimento local; produção exige parametrizar a URL da API.
- A API ainda não autentica usuários, permite CORS amplo e persiste uploads no sistema de arquivos local. Não a exponha à Internet sem resolver esses limites.
- O pipeline CI executa os testes deste repositório; as Actions Variables `SONAR_ORGANIZATION` e `SONAR_PROJECT_KEY` e a Secret `SONAR_TOKEN` ativam a análise SonarCloud.
