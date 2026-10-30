# Casos de uso

## Atores

- **Analista/equipe:** registra uma luta, importa hits e consulta o dashboard.
- **Detector externo:** quando habilitado, processa o vídeo e devolve hits ao backend por callback interno.
- **Prometheus:** coleta métricas operacionais da API HitTrack.

## UC-01 — Registrar luta e importar hits

| Campo | Descrição |
|---|---|
| Ator principal | Analista/equipe |
| Pré-condições | API disponível; identificadores de dois robôs e parâmetros de duração/FPS conhecidos |
| Gatilho | Criar luta ou enviar eventos pela API |
| Fluxo principal | 1. Enviar `POST /api/fights`. 2. API valida robôs, duração e FPS e persiste o cadastro. 3. Enviar vídeo com `POST /api/fights/{id}/video` ou hits com `POST /api/fights/{id}/hits` / `POST /api/fights/{id}/hits/upload`. 4. API valida formato, frame e robô, associa os registros à luta. |
| Alternativas/erros | Campos inválidos: `422`; luta inexistente: `404`; formato de vídeo não suportado: `415`; evento sem robô válido: `422`. |
| Pós-condições | Luta e dados enviados ficam persistidos e disponíveis para consulta. |

## UC-02 — Analisar vídeo e calcular métricas

| Campo | Descrição |
|---|---|
| Ator principal | Analista/equipe; detector externo como sistema de apoio |
| Pré-condições | Luta cadastrada com vídeo acessível; detector e pesos configurados em `AI_PROJECT_DIR` |
| Gatilho | `POST /api/fights/{id}/analyze` ou leitura de `GET /api/fights/{id}/metrics` |
| Fluxo principal | 1. API verifica luta e vídeo. 2. Limpa eventos de análises anteriores da luta e inicia o worker em segundo plano. 3. Worker processa o vídeo e persiste eventos não duplicados. 4. `GET /api/fights/{id}/metrics` agrupa aliases e calcula hits, hits/minuto e distribuição por terço. |
| Alternativas/erros | Luta inexistente: `404`; vídeo ausente ou inacessível: `400`; sem detector: requisito operacional não atendido, análise indisponível. Hits também podem ser importados manualmente sem esse ator. |
| Pós-condições | Eventos e métricas ficam associados à luta; análise atualiza o status. |

## UC-03 — Consultar dashboard e histórico

| Campo | Descrição |
|---|---|
| Ator principal | Analista/equipe |
| Pré-condições | Frontend e API acessíveis; existe ao menos uma luta para visualizar dados |
| Gatilho | Abrir o dashboard, selecionar Análise/Ao vivo/Histórico ou buscar por robô/equipe |
| Fluxo principal | 1. Frontend carrega luta, métricas, placar e histórico. 2. Apresenta comparação entre robôs e distribuição temporal. 3. Permite selecionar uma luta e filtrar o histórico por robô e equipe. |
| Alternativas/erros | Luta atual não encontrada: exibe estado sem métricas e remove o identificador salvo. API indisponível: apresenta aviso de conexão. |
| Pós-condições | Analista pode inspecionar dados da luta selecionada sem modificar eventos. |

## UC-04 — Coletar métricas operacionais

| Campo | Descrição |
|---|---|
| Ator principal | Prometheus |
| Pré-condições | API HitTrack em execução e acessível pela rede de monitoramento |
| Gatilho | Scrape de `GET /metrics` |
| Fluxo principal | 1. Prometheus consulta a API periodicamente. 2. A API expõe contagem, duração e requisições em andamento. 3. Grafana lê a fonte Prometheus e apresenta os painéis provisionados. |
| Pós-condições | Métricas operacionais ficam disponíveis para inspeção local. |
