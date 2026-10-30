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

O frontend consulta luta, métricas e placar; apresenta comparação, vídeo quando a análise termina, histórico filtrável por robô/equipe/competição, cadastro de luta em uma tela dedicada e uma visão agregada com filtros inclusivos de período, categoria, competição, robô e equipe. A visão agregada compara eficácia por resultado, consistência e perfil estatístico por equipe, além de exibir a dispersão ELO × hits e a distribuição de hits por luta. O histórico é fornecido por `GET /api/fights`; as métricas agregadas são fornecidas por `GET /api/analytics`.

## Métricas agregadas

`GET /api/analytics` aceita `start_date`, `end_date`, `category`, `competition`, `robot` e `team`. As datas são inclusivas e aplicadas a `fought_at`; se essa data não foi informada, usa-se `created_at` como alternativa para que lutas já cadastradas continuem filtráveis. Competição, robô e equipe devem corresponder aos nomes cadastrados na luta. Se mais de um desses filtros for informado, todos devem corresponder à luta. A interface usa os seletores de calendário nativos do navegador, com idioma `pt-BR`, e envia ISO `aaaa-mm-dd` à API. Lutas sem nenhuma das datas não entram em filtros por período. Se `start_date` for posterior a `end_date`, a API responde com HTTP 422.

Para criar uma luta, competição, categoria, dois robôs, duas equipes, vídeo e FPS são obrigatórios. A duração não é editável: o frontend lê os metadados do vídeo enviado e encaminha a duração em segundos à API. Os campos de competição, robôs e equipes aceitam selecionar nomes existentes ou cadastrar nomes digitados.

- **Hits por minuto:** total de hits do robô/equipe dividido pela soma das durações das lutas em que participou, multiplicado por 60.
- **Eficácia por resultado:** média de hits por luta, separada em vitória e derrota. Ao encerrar ou concluir a análise, o robô com mais hits é registrado automaticamente como vencedor e o outro como derrotado. Se os hits empatarem, o resultado fica pendente de avaliação manual pela interface e pode ser registrado por `PATCH /api/fights/{id}/result`. Lutas sem vencedor registrado não entram nas contagens.
- **Consistência:** desvio padrão amostral da quantidade de hits por participação em luta; permanece indisponível com menos de duas participações.
- **Correlação com ELO:** Pearson e Spearman calculados entre ELO pré-luta e hits do mesmo robô em cada participação. ELO pode ser informado no cadastro ou atualizado no detalhe da luta por `PATCH /api/fights/{id}/elo`; deve corresponder ao valor pré-luta. Sem ELO registrado não existem pares para correlacionar. Exige ao menos três pares válidos; correlação indefinida (por exemplo, valores constantes) permanece indisponível. Empates no ranking de Spearman recebem postos médios.
- **Perfil de equipe:** agrega resultados e hits por participação de robôs associados à equipe; não atribui uma equipe quando ela não foi informada.
- **Visualizações:** dispersão representa cada par disponível ELO/hits; o histograma agrupa hits por robô e luta nas faixas 0–4, 5–9, 10–19 e 20 ou mais.

As correlações indicam associação, não causalidade. Pearson/Spearman mostram quantos pares faltam para a amostra mínima, e o desvio padrão informa quando há menos de duas lutas; esses casos não são apresentados como zero.

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
| Registrar vencedor | `PATCH /api/fights/{id}/result` | Vencedor oficial informado após o encerramento |
| Registrar ELO pré-luta | `PATCH /api/fights/{id}/elo` | Atualiza os valores de ELO dos dois robôs para a luta |
| Consultar métricas agregadas | `GET /api/analytics` | Agregados por robô/equipe e amostras para gráficos; filtros opcionais por período, categoria, competição, robô e equipe |
| Coletar métricas operacionais | `GET /metrics` | Exposição Prometheus |

O esquema detalhado dos payloads está em `backend/schemas.py`; as rotas estão em `backend/routers/fights.py` e `backend/main.py`.

## Limites e requisitos externos

- A análise de vídeo depende de `detector.CamWorker`, dos pesos e dos dados providos pelo projeto separado `hitcount-ia`. Esse código não está neste repositório.
- Para importar hits sem executar o detector, use os endpoints de ingestão de eventos.
- As métricas analíticas dependem dos hits, vencedor, equipes, datas e valores de ELO efetivamente registrados; dados ausentes não são inferidos nem fabricados. Resultados legados registrados como empate são normalizados como não informados, sem afetar hits ou outras métricas.
- O frontend usa `http://127.0.0.1:8000` diretamente e foi configurado para desenvolvimento local; produção exige parametrizar a URL da API.
- A API ainda não autentica usuários, permite CORS amplo e persiste uploads no sistema de arquivos local. Não a exponha à Internet sem resolver esses limites.
- O pipeline CI executa os testes deste repositório; as Actions Variables `SONAR_ORGANIZATION` e `SONAR_PROJECT_KEY` e a Secret `SONAR_TOKEN` ativam a análise SonarCloud.
