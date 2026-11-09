import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  ChartNoAxesCombined,
  CircleAlert,
  CircleHelp,
  ChevronDown,
  ChevronRight,
  Eraser,
  Gauge,
  History,
  Home,
  Radio,
  RefreshCw,
  Search,
  StopCircle,
  Target,
  Trophy,
  Upload,
  Video,
} from "lucide-react";

const API_URL = "http://127.0.0.1:8000";
const DEFAULT_FIGHT_ID = 1;
const EMPTY_FIGHT_FORM = {
  robot_red: "",
  robot_green: "",
  team_red: "",
  team_green: "",
  competition: "",
  category: "",
  duration_seconds: "",
  fps: 30,
  elo_red: "",
  elo_green: "",
};
const CATEGORY_LABELS = {
  fairyweight: "Fairyweight · 150 g",
  antweight: "Antweight · 454 g",
  beetleweight: "Beetleweight · 1,36 kg",
  hobbyweight: "Hobbyweight · 5,44 kg",
};

const emptyMetrics = {
  fight_id: null,
  duration_seconds: 0,
  total_hits: 0,
  robots: [],
};

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function MetricCard({ icon: Icon, label, value, detail, tone = "neutral" }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-card__top">
        <span className="metric-icon"><Icon size={17} strokeWidth={2.2} /></span>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function TooltipHint() {
  const tooltipId = useId();
  return (
    <span className="tooltip-hint">
      <button type="button" aria-label="Sobre o ELO pré-luta" aria-describedby={tooltipId}>
        <CircleHelp size={13} />
      </button>
      <span className="tooltip-hint__content" id={tooltipId} role="tooltip">
        Pontuação que representa o nível estimado do robô antes desta luta. Informe o valor manualmente; ele é usado para analisar a relação entre ELO e hits.
      </span>
    </span>
  );
}

function RequiredMark() {
  return <span className="required-mark" aria-hidden="true">*</span>;
}

function EntityField({
  label,
  options,
  value,
  onChange,
  optional = false,
  entityName = optional ? "equipe" : "robô",
  emptyOptionLabel = optional ? "Sem equipe" : "",
  searchAsValue = false,
  createLabel = "Cadastrar",
  allowCreate = true,
  optionLabels = {},
  noOptionsLabel = optional ? "Nenhuma equipe encontrada." : "Nenhum nome encontrado.",
}) {
  const fieldId = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = options.filter((option) => (
    option.toLocaleLowerCase().includes(normalizedQuery)
    || optionLabels[option]?.toLocaleLowerCase().includes(normalizedQuery)
  ));
  const canCreate = allowCreate && normalizedQuery && !filteredOptions.length;

  useEffect(() => {
    if (!isOpen) return undefined;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isOpen]);

  function chooseOption(option) {
    onChange(option);
    setQuery("");
    setIsOpen(false);
  }

  function toggleDropdown() {
    setIsOpen((open) => {
      if (!open) setQuery(searchAsValue ? value : "");
      return !open;
    });
  }

  return (
    <div className={`entity-field ${isOpen ? "is-open" : ""}`} ref={rootRef}>
      <label htmlFor={`${fieldId}-trigger`}>{label}{!optional && <> <RequiredMark /></>}</label>
      <button
        id={`${fieldId}-trigger`}
        className={`entity-select-trigger ${isOpen ? "is-open" : ""}`}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${fieldId}-options`}
        aria-required={!optional}
        onClick={toggleDropdown}
      >
        <span className={value || query ? "" : "entity-select-placeholder"}>{optionLabels[value] || value || query || `Selecione ${entityName}...`}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="entity-select-menu">
          <label className="entity-search">
            <Search size={18} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              aria-label={`Buscar ${label.toLocaleLowerCase()}`}
              placeholder={`Buscar ${entityName}...`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (searchAsValue) onChange(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setIsOpen(false);
                if (event.key === "Enter" && canCreate) {
                  event.preventDefault();
                  chooseOption(query.trim());
                }
              }}
            />
          </label>
          <div className="entity-select-options" id={`${fieldId}-options`} role="listbox" aria-label={`Opções de ${label.toLocaleLowerCase()}`}>
            {optional && emptyOptionLabel && (
              <button type="button" role="option" aria-selected={!value} onClick={() => chooseOption("")}>{emptyOptionLabel}</button>
            )}
            {filteredOptions.map((option) => (
              <button type="button" role="option" aria-selected={value === option} key={option} onClick={() => chooseOption(option)}>
                {optionLabels[option] || option}
              </button>
            ))}
            {canCreate && (
              <button className="entity-create-option" type="button" role="option" aria-selected="false" onClick={() => chooseOption(query.trim())}>
                {createLabel} “{query.trim()}”
              </button>
            )}
            {!filteredOptions.length && !canCreate && !optional && (
              <span className="entity-no-options">{noOptionsLabel}</span>
            )}
            {optional && normalizedQuery && !filteredOptions.length && !canCreate && (
              <span className="entity-no-options">{noOptionsLabel}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DistributionChart({ robots }) {
  const maximum = Math.max(...robots.flatMap((robot) => robot.third_distribution), 1);
  return (
    <div className="distribution-chart" aria-label="Distribuição de hits por terço da luta">
      <div className="chart-grid">
        {[0, 1, 2].map((index) => (
          <div className="chart-group" key={index}>
            <div className="bars">
              {robots.map((robot, robotIndex) => {
                const value = robot.third_distribution[index];
                return (
                  <div className="bar-column" key={robot.robot}>
                    <div className="bar-value">{value}</div>
                    <div
                      className={`bar bar-${robotIndex}`}
                      style={{ height: `${Math.max((value / maximum) * 100, value ? 8 : 2)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <span>Terço {index + 1}</span>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        {robots.map((robot, index) => (
          <span key={robot.robot}><i className={`legend-dot dot-${index}`} />{robot.robot}</span>
        ))}
      </div>
    </div>
  );
}

function ScatterPlot({ fights }) {
  const points = fights.flatMap((fight) => [
    { fightId: fight.fight_id, robot: fight.robot_red, elo: fight.elo_red, hits: fight.hits_red },
    { fightId: fight.fight_id, robot: fight.robot_green, elo: fight.elo_green, hits: fight.hits_green },
  ]).filter((point) => point.elo !== null && point.elo !== undefined);
  if (!points.length) return <div className="analytics-empty">Nenhum ELO pré-luta foi cadastrado para este recorte.</div>;

  const minElo = Math.min(...points.map((point) => point.elo));
  const maxElo = Math.max(...points.map((point) => point.elo));
  const maxHits = Math.max(...points.map((point) => point.hits), 1);
  const x = (elo) => 38 + ((elo - minElo) / Math.max(maxElo - minElo, 1)) * 430;
  const y = (hits) => 190 - (hits / maxHits) * 160;

  return (
    <svg className="analytics-scatter" viewBox="0 0 500 230" role="img" aria-label="Dispersão de ELO por quantidade de hits">
      <line x1="38" y1="190" x2="475" y2="190" />
      <line x1="38" y1="20" x2="38" y2="190" />
      <text x="238" y="228">ELO</text>
      <text x="38" y="215">{minElo}</text>
      <text x="438" y="215">{maxElo}</text>
      <text x="4" y="14">Hits</text>
      <text x="4" y="27">{maxHits}</text>
      <text x="13" y="192">0</text>
      {points.map((point, index) => (
        <circle
          key={`${point.fightId}-${point.robot}-${index}`}
          cx={x(point.elo)}
          cy={y(point.hits)}
          r="6"
          className={`scatter-point scatter-point-${index % 2}`}
          data-testid="elo-scatter-point"
        >
          <title>{`${point.robot} · luta ${point.fightId} · ELO ${point.elo} · ${point.hits} hits`}</title>
        </circle>
      ))}
    </svg>
  );
}

function HitHistogram({ fights }) {
  const ranges = [
    { label: "0–4", min: 0, max: 4 },
    { label: "5–9", min: 5, max: 9 },
    { label: "10–19", min: 10, max: 19 },
    { label: "20+", min: 20, max: Number.POSITIVE_INFINITY },
  ];
  const values = fights.flatMap((fight) => [
    { robot: fight.robot_red, hits: fight.hits_red },
    { robot: fight.robot_green, hits: fight.hits_green },
  ]);
  if (!values.length) return <div className="analytics-empty">Não há lutas para montar o histograma.</div>;
  const counts = ranges.map((range) =>
    values.filter((value) => value.hits >= range.min && value.hits <= range.max).length,
  );
  const maximum = Math.max(...counts, 1);

  return (
    <div className="hit-histogram" role="img" aria-label="Histograma de hits por robô e luta">
      {ranges.map((range, index) => (
        <div className="histogram-bin" key={range.label}>
          <strong>{counts[index]}</strong>
          <div className="histogram-track">
            <span style={{ height: `${Math.max((counts[index] / maximum) * 100, counts[index] ? 8 : 2)}%` }} />
          </div>
          <small>{range.label}</small>
        </div>
      ))}
    </div>
  );
}

function formatMetric(value, suffix = "") {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(2)}${suffix}`;
}

function formatDeviation(value, fightCount) {
  if (value !== null && value !== undefined) return formatMetric(value);
  return fightCount < 2 ? `${fightCount}/2 lutas` : "Indisponível";
}

function formatCorrelation(value, observations) {
  if (value !== null && value !== undefined) return formatMetric(value);
  return observations < 3 ? `${observations}/3 pares` : "Indefinida";
}

function AggregateAnalytics({
  analytics,
  loading,
  error,
  filters,
  robotOptions,
  teamOptions,
  competitionOptions,
  onFilterChange,
  onClearFilters,
  onRefresh,
}) {
  return (
    <section className="aggregate-analytics" aria-label="Análise agregada">
      <div className="analytics-heading">
        <div>
          <p className="eyebrow">Desempenho ao longo do histórico</p>
          <h2>Métricas agregadas</h2>
          <p className="intro">Resultados por robô e equipe. Para correlação, cadastre o ELO pré-luta; são necessários ao menos 3 pares por robô.</p>
        </div>
        <button className="refresh-button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : ""} /> Atualizar
        </button>
      </div>
      <div className="analytics-filters filter-fields">
        <label className="analytics-date-filter">Desde<input aria-label="Desde" lang="pt-BR" type="date" value={filters.startDate} onChange={(event) => onFilterChange("startDate", event.target.value)} /></label>
        <label className="analytics-date-filter">Até<input aria-label="Até" lang="pt-BR" type="date" value={filters.endDate} onChange={(event) => onFilterChange("endDate", event.target.value)} /></label>
        <EntityField
          label="Categoria"
          entityName="categorias"
          options={Object.keys(CATEGORY_LABELS)}
          optionLabels={CATEGORY_LABELS}
          value={filters.category}
          onChange={(value) => onFilterChange("category", value)}
          optional
          emptyOptionLabel="Todas as categorias"
          allowCreate={false}
          noOptionsLabel="Nenhuma categoria encontrada."
        />
        <EntityField
          label="Robô"
          entityName="robôs"
          options={robotOptions}
          value={filters.robot}
          onChange={(value) => onFilterChange("robot", value)}
          optional
          emptyOptionLabel="Todos os robôs"
          searchAsValue
          createLabel="Filtrar por"
        />
        <EntityField
          label="Equipe"
          entityName="equipes"
          options={teamOptions}
          value={filters.team}
          onChange={(value) => onFilterChange("team", value)}
          optional
          emptyOptionLabel="Todas as equipes"
          searchAsValue
          createLabel="Filtrar por"
        />
        <EntityField
          label="Competição"
          entityName="competições"
          options={competitionOptions}
          value={filters.competition}
          onChange={(value) => onFilterChange("competition", value)}
          optional
          emptyOptionLabel="Todas as competições"
          searchAsValue
          createLabel="Filtrar por"
        />
        <button className="clear-filters-button" onClick={onClearFilters} disabled={loading}>
          <Eraser size={14} /> Limpar filtros
        </button>
        <span className="analytics-count">
          {loading ? "Atualizando..." : error ? "Falha ao atualizar" : `${analytics?.fight_count ?? 0} lutas no recorte`}
        </span>
      </div>
      {error && <div className="notice" role="alert">{error}</div>}
      {loading && <div className="analytics-loading" role="status">Carregando métricas...</div>}
      {!loading && !error && analytics?.fight_count === 0 && (
        <div className="analytics-empty" role="status">Nenhuma luta corresponde aos filtros selecionados.</div>
      )}
      {!loading && !error && analytics?.fight_count > 0 && (
        <>
          <div className="analytics-chart-grid">
            <article className="panel analytics-panel">
              <div className="panel-heading"><div><span className="section-kicker">Correlação</span><h3>Dispersão ELO × hits</h3></div></div>
              <ScatterPlot fights={analytics.fights} />
              <p className="analytics-note">São necessários ao menos 3 pares válidos de ELO pré-luta e hits por robô. Sem ELO cadastrado, não há pontos nem correlação.</p>
            </article>
            <article className="panel analytics-panel">
              <div className="panel-heading"><div><span className="section-kicker">Distribuição</span><h3>Hits por luta e robô</h3></div></div>
              <HitHistogram fights={analytics.fights} />
              <div className="histogram-legend"><span>Quantidade de ocorrências em cada faixa</span></div>
            </article>
          </div>
          <article className="panel analytics-panel analytics-table-panel">
            <div className="panel-heading"><div><span className="section-kicker">Perfil por equipe</span><h3>Resumo e eficácia</h3></div></div>
            <div className="analytics-table-scroll">
              <table className="analytics-table">
                <thead><tr><th>Equipe</th><th>Lutas</th><th>V / D</th><th>Hits</th><th>Hits/min</th><th>Desvio padrão</th><th>Média em vitórias</th><th>Média em derrotas</th></tr></thead>
                <tbody>
                  {analytics.teams.map((team) => (
                    <tr key={team.team}>
                      <th scope="row">{team.team}</th><td>{team.fight_count}</td><td>{team.wins} / {team.losses}</td>
                      <td>{team.total_hits}</td><td>{formatMetric(team.hits_per_minute)}</td><td>{formatDeviation(team.sample_stddev_hits, team.fight_count)}</td>
                      <td>{formatMetric(team.outcomes.find((item) => item.outcome === "vitoria")?.average_hits)}</td>
                      <td>{formatMetric(team.outcomes.find((item) => item.outcome === "derrota")?.average_hits)}</td>
                    </tr>
                  ))}
                  {!analytics.teams.length && <tr><td colSpan="8">Não há equipes identificadas nas lutas filtradas.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
          <article className="panel analytics-panel analytics-table-panel">
            <div className="panel-heading"><div><span className="section-kicker">Perfil individual</span><h3>Robôs, resultados e ELO</h3></div></div>
            <div className="analytics-table-scroll">
              <table className="analytics-table">
                <thead><tr><th>Robô</th><th>Lutas</th><th>V / D</th><th>Hits/min</th><th>Desvio padrão</th><th>Média V / D</th><th>Pearson (ELO)</th><th>Spearman (ELO)</th></tr></thead>
                <tbody>
                  {analytics.robots.map((robot) => (
                    <tr key={robot.robot}>
                      <th scope="row">{robot.robot}</th><td>{robot.fight_count}</td><td>{robot.wins} / {robot.losses}</td>
                      <td>{formatMetric(robot.hits_per_minute)}</td><td>{formatDeviation(robot.sample_stddev_hits, robot.fight_count)}</td>
                      <td>{robot.outcomes.map((item) => formatMetric(item.average_hits)).join(" / ")}</td>
                      <td>{formatCorrelation(robot.elo_correlation.pearson, robot.elo_correlation.observations)}</td>
                      <td>{formatCorrelation(robot.elo_correlation.spearman, robot.elo_correlation.observations)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}

export default function App() {
  const [view, setView] = useState("home");
  const [fightId, setFightId] = useState(() => Number(localStorage.getItem("hittrack-fight-id")) || DEFAULT_FIGHT_ID);
  const [fight, setFight] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [form, setForm] = useState(EMPTY_FIGHT_FORM);
  const [formResetKey, setFormResetKey] = useState(0);
  const [savingFight, setSavingFight] = useState(false);
  const [fightFormError, setFightFormError] = useState("");
  const [videoDurationLoading, setVideoDurationLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const videoInputRef = useRef(null);
  const videoObjectUrlRef = useRef(null);
  const videoSelectionIdRef = useRef(0);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [liveHits, setLiveHits] = useState({ lado_vermelho: 0, lado_verde: 0 });
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState({ active: false, frame: 0 });
  const [fights, setFights] = useState([]);
  const [robotQuery, setRobotQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [competitionQuery, setCompetitionQuery] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsFilters, setAnalyticsFilters] = useState({
    startDate: "",
    endDate: "",
    category: "",
    competition: "",
    robot: "",
    team: "",
  });
  const [winnerError, setWinnerError] = useState("");
  const [savingWinner, setSavingWinner] = useState(false);
  const [eloForm, setEloForm] = useState({ elo_red: "", elo_green: "" });
  const [eloError, setEloError] = useState("");
  const [savingElo, setSavingElo] = useState(false);
  const robotOptions = useMemo(
    () => [...new Set(fights.flatMap((item) => [item.robot_red, item.robot_green]).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [fights],
  );
  const teamOptions = useMemo(
    () => [...new Set(fights.flatMap((item) => [item.team_red, item.team_green]).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [fights],
  );
  const competitionOptions = useMemo(
    () => [...new Set(fights.map((item) => item.competition).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [fights],
  );
  const teamsByRobot = useMemo(() => {
    const associations = new Map();
    for (const historicalFight of fights) {
      for (const [robot, team] of [
        [historicalFight.robot_red, historicalFight.team_red],
        [historicalFight.robot_green, historicalFight.team_green],
      ]) {
        if (!robot || !team) continue;
        if (!associations.has(robot)) associations.set(robot, new Set());
        associations.get(robot).add(team);
      }
    }
    return associations;
  }, [fights]);
  const robotsForTeam = (team) => team
    ? robotOptions.filter((robot) => teamsByRobot.get(robot)?.has(team))
    : robotOptions;

  function revokeVideoObjectUrl() {
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current);
      videoObjectUrlRef.current = null;
    }
  }

  function selectFightVideo(file) {
    videoSelectionIdRef.current += 1;
    const selectionId = videoSelectionIdRef.current;
    revokeVideoObjectUrl();
    setVideoFile(file);
    setVideoDurationLoading(Boolean(file));
    setFightFormError("");
    setForm((current) => ({ ...current, duration_seconds: "" }));
    if (!file) return;

    let objectUrl;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      setVideoDurationLoading(false);
      setFightFormError("Não foi possível ler a duração deste vídeo.");
      return;
    }
    videoObjectUrlRef.current = objectUrl;
    const metadataVideo = document.createElement("video");
    metadataVideo.preload = "metadata";
    metadataVideo.onloadedmetadata = () => {
      if (selectionId !== videoSelectionIdRef.current) return;
      const duration = metadataVideo.duration;
      revokeVideoObjectUrl();
      setVideoDurationLoading(false);
      if (!Number.isFinite(duration) || duration <= 0) {
        setFightFormError("Não foi possível obter uma duração válida do vídeo.");
        return;
      }
      setForm((current) => ({ ...current, duration_seconds: String(Number(duration.toFixed(3))) }));
    };
    metadataVideo.onerror = () => {
      if (selectionId !== videoSelectionIdRef.current) return;
      revokeVideoObjectUrl();
      setVideoDurationLoading(false);
      setFightFormError("Não foi possível ler a duração deste vídeo. Verifique o arquivo e tente novamente.");
    };
    metadataVideo.src = objectUrl;
    metadataVideo.load();
  }

  function clearFightForm() {
    videoSelectionIdRef.current += 1;
    revokeVideoObjectUrl();
    setForm({ ...EMPTY_FIGHT_FORM });
    setVideoFile(null);
    setVideoDurationLoading(false);
    setFightFormError("");
    setFormResetKey((current) => current + 1);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  useEffect(() => () => {
    videoSelectionIdRef.current += 1;
    revokeVideoObjectUrl();
  }, []);

  function updateFightRobot(side, robot) {
    const teamField = side === "red" ? "team_red" : "team_green";
    setForm((current) => {
      const associatedTeams = [...(teamsByRobot.get(robot) || [])];
      const matchingCurrentTeam = associatedTeams.includes(current[teamField]) ? current[teamField] : "";
      const team = matchingCurrentTeam || associatedTeams[0] || "";
      return {
        ...current,
        [side === "red" ? "robot_red" : "robot_green"]: robot,
        ...(associatedTeams.length || robotOptions.includes(robot) ? { [teamField]: team } : {}),
      };
    });
  }

  function updateFightTeam(side, team) {
    const robotField = side === "red" ? "robot_red" : "robot_green";
    const teamField = side === "red" ? "team_red" : "team_green";
    setForm((current) => {
      const robot = current[robotField];
      const robotIsKnown = robotOptions.includes(robot);
      const robotBelongsToTeam = teamsByRobot.get(robot)?.has(team);
      return {
        ...current,
        [teamField]: team,
        ...(robotIsKnown && !robotBelongsToTeam ? { [robotField]: "" } : {}),
      };
    });
  }

  async function loadData() {
    setLoading(true);
    try {
      const [fightResponse, metricsResponse, hitsResponse] = await Promise.all([
        fetch(`${API_URL}/api/fights/${fightId}`),
        fetch(`${API_URL}/api/fights/${fightId}/metrics`),
        fetch(`${API_URL}/hits`),
      ]);
      if (fightResponse.status === 404) {
        setFight(null);
        setMetrics(emptyMetrics);
        setLiveHits({ lado_vermelho: 0, lado_verde: 0 });
        setOffline(false);
        localStorage.removeItem("hittrack-fight-id");
        return;
      }
      if (!fightResponse.ok || !metricsResponse.ok || !hitsResponse.ok) throw new Error("API indisponível");
      const fightData = await fightResponse.json();
      setFight(fightData);
      setEloForm({
        elo_red: fightData.elo_red ?? "",
        elo_green: fightData.elo_green ?? "",
      });
      setMetrics(await metricsResponse.json());
      setLiveHits(await hitsResponse.json());
      setOffline(false);
      localStorage.setItem("hittrack-fight-id", String(fightId));
      setLastUpdated(new Date());
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const response = await fetch(`${API_URL}/api/fights`);
      if (!response.ok) throw new Error("Histórico indisponível");
      setFights(await response.json());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }

  const loadAnalytics = useCallback(async (signal) => {
    setAnalyticsLoading(true);
    setAnalyticsError("");
    const params = new URLSearchParams();
    if (analyticsFilters.startDate) params.set("start_date", analyticsFilters.startDate);
    if (analyticsFilters.endDate) params.set("end_date", analyticsFilters.endDate);
    if (analyticsFilters.category) params.set("category", analyticsFilters.category);
    if (analyticsFilters.competition) params.set("competition", analyticsFilters.competition);
    if (analyticsFilters.robot) params.set("robot", analyticsFilters.robot);
    if (analyticsFilters.team) params.set("team", analyticsFilters.team);
    const query = params.toString();
    try {
      const response = await fetch(`${API_URL}/api/analytics${query ? `?${query}` : ""}`, { signal });
      if (!response.ok) throw new Error("Não foi possível carregar as métricas agregadas.");
      setAnalytics(await response.json());
    } catch (error) {
      if (error.name !== "AbortError") setAnalyticsError(error.message);
    } finally {
      if (!signal?.aborted) setAnalyticsLoading(false);
    }
  }, [analyticsFilters]);

  useEffect(() => {
    loadData();
    loadHistory();
    const metricsInterval = setInterval(loadData, 5000);
    const liveInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/hits`);
        if (!response.ok) throw new Error("Placar indisponível");
        setLiveHits(await response.json());
        const statusResponse = await fetch(`${API_URL}/analysis/status`);
        if (statusResponse.ok) setAnalysisStatus(await statusResponse.json());
      } catch {
        setOffline(true);
      }
    }, 300);
    return () => {
      clearInterval(metricsInterval);
      clearInterval(liveInterval);
    };
  }, [fightId]);

  useEffect(() => {
    if (view !== "analytics") return undefined;
    const controller = new AbortController();
    loadAnalytics(controller.signal);
    return () => controller.abort();
  }, [view, loadAnalytics]);

  function updateAnalyticsFilter(field, value) {
    setAnalyticsFilters((current) => ({ ...current, [field]: value }));
  }

  function openFight(selectedFightId) {
    setFightId(selectedFightId);
    localStorage.setItem("hittrack-fight-id", String(selectedFightId));
    setView("overview");
  }

  function openLatestFight() {
    const latestFight = fights[0];
    if (latestFight) {
      openFight(latestFight.id);
    } else {
      setView("history");
    }
  }

  async function createFight(event) {
    event.preventDefault();
    setFightFormError("");
    if (offline) {
      setFightFormError("API offline. Reconecte a API antes de criar uma luta.");
      return;
    }
    if (!form.competition || !form.category || !form.robot_red || !form.robot_green || !form.team_red || !form.team_green || !form.fps || !videoFile) {
      setFightFormError("Preencha todos os campos obrigatórios: competição, categoria, robôs, equipes, vídeo e FPS.");
      return;
    }
    if (videoDurationLoading || !Number(form.duration_seconds)) {
      setFightFormError("Aguarde a leitura da duração do vídeo antes de continuar.");
      return;
    }
    setSavingFight(true);
    try {
      let healthResponse;
      try {
        healthResponse = await fetch(`${API_URL}/`);
      } catch {
        setOffline(true);
        throw new Error("API offline. Reconecte a API antes de criar uma luta.");
      }
      if (!healthResponse.ok) {
        setOffline(true);
        throw new Error("API offline. Reconecte a API antes de criar uma luta.");
      }
      setOffline(false);
      const fightResponse = await fetch(`${API_URL}/api/fights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          robot_red: form.robot_red,
          robot_green: form.robot_green,
          team_red: form.team_red,
          team_green: form.team_green,
          competition: form.competition,
          category: form.category,
          duration_seconds: Number(form.duration_seconds),
          fps: Number(form.fps),
          elo_red: form.elo_red === "" ? null : Number(form.elo_red),
          elo_green: form.elo_green === "" ? null : Number(form.elo_green),
          robot_aliases: { vermelho: form.robot_red, azul: form.robot_green },
        }),
      });
      if (!fightResponse.ok) throw new Error("Não foi possível criar a luta");
      const fight = await fightResponse.json();
      const upload = new FormData();
      upload.append("file", videoFile);
      const uploadResponse = await fetch(`${API_URL}/api/fights/${fight.id}/video`, { method: "POST", body: upload });
      if (!uploadResponse.ok) throw new Error("Não foi possível enviar o vídeo");
      const analysisResponse = await fetch(`${API_URL}/api/fights/${fight.id}/analyze`, { method: "POST" });
      if (!analysisResponse.ok) throw new Error("Não foi possível iniciar a análise");
      setFightId(fight.id);
      localStorage.setItem("hittrack-fight-id", String(fight.id));
      setView("live");
      await loadHistory();
      clearFightForm();
      setFightFormError("");
    } catch (error) {
      if (error instanceof TypeError) setOffline(true);
      setFightFormError(error.message);
      console.error(error);
    } finally {
      setSavingFight(false);
    }
  }

  async function startAnalysis() {
    setAnalyzing(true);
    try {
      const response = await fetch(`${API_URL}/api/fights/${fightId}/analyze`, { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível iniciar a análise");
      setView("live");
      setLiveHits({ lado_vermelho: 0, lado_verde: 0 });
    } catch (error) {
      setOffline(true);
      console.error(error);
    } finally {
      setAnalyzing(false);
    }
  }

  async function stopFight() {
    setStopping(true);
    try {
      const response = await fetch(`${API_URL}/api/fights/${fightId}/stop`, { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível encerrar a luta");
      const stoppedFight = await response.json();
      setFight((current) => current ? { ...current, ...stoppedFight } : current);
      setAnalysisStatus({ active: false, frame: stoppedFight.frame || 1 });
      setView("overview");
      await Promise.all([loadData(), loadHistory()]);
    } catch (error) {
      setOffline(true);
      console.error(error);
    } finally {
      setStopping(false);
    }
  }

  async function recordWinner(winnerRobot) {
    setSavingWinner(true);
    setWinnerError("");
    try {
      const response = await fetch(`${API_URL}/api/fights/${fightId}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner_robot: winnerRobot }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Não foi possível registrar o vencedor.");
      }
      const updatedFight = await response.json();
      setFight(updatedFight);
      await loadHistory();
    } catch (error) {
      setWinnerError(error.message);
    } finally {
      setSavingWinner(false);
    }
  }

  async function saveFightElo(event) {
    event.preventDefault();
    setSavingElo(true);
    setEloError("");
    try {
      const response = await fetch(`${API_URL}/api/fights/${fightId}/elo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elo_red: eloForm.elo_red === "" ? null : Number(eloForm.elo_red),
          elo_green: eloForm.elo_green === "" ? null : Number(eloForm.elo_green),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Não foi possível salvar o ELO desta luta.");
      }
      const updatedFight = await response.json();
      setFight(updatedFight);
      setEloForm({ elo_red: updatedFight.elo_red ?? "", elo_green: updatedFight.elo_green ?? "" });
    } catch (error) {
      setEloError(error.message);
    } finally {
      setSavingElo(false);
    }
  }

  const leadingRobot = useMemo(
    () => metrics.robots.reduce((leader, robot) => (robot.hits > leader.hits ? robot : leader), metrics.robots[0] || { robot: "Nenhum robô", hits: 0, hits_per_minute: 0, third_distribution: [0, 0, 0] }),
    [metrics],
  );
  const liveTotal = liveHits.lado_vermelho + liveHits.lado_verde;
  const redRobotName = fight?.robot_red || metrics.robots[0]?.robot || "Robô vermelho";
  const greenRobotName = fight?.robot_green || metrics.robots[1]?.robot || "Robô verde";
  const analysisFinished = !analysisStatus.active && analysisStatus.frame > 0;
  const filteredFights = useMemo(() => {
    const robotTerm = robotQuery.trim().toLocaleLowerCase();
    const teamTerm = teamQuery.trim().toLocaleLowerCase();
    const competitionTerm = competitionQuery.trim().toLocaleLowerCase();
    return fights.filter((historicalFight) => {
      const robots = `${historicalFight.robot_red} ${historicalFight.robot_green}`.toLocaleLowerCase();
      const teams = `${historicalFight.team_red || ""} ${historicalFight.team_green || ""}`.toLocaleLowerCase();
      const competition = (historicalFight.competition || "").toLocaleLowerCase();
      return (!robotTerm || robots.includes(robotTerm))
        && (!teamTerm || teams.includes(teamTerm))
        && (!competitionTerm || competition.includes(competitionTerm));
    });
  }, [fights, robotQuery, teamQuery, competitionQuery]);
  const historyStats = useMemo(() => {
    const robots = new Set(fights.flatMap((historicalFight) => [historicalFight.robot_red, historicalFight.robot_green].filter(Boolean)));
    return {
      totalHits: fights.reduce((total, historicalFight) => total + Number(historicalFight.total_hits || 0), 0),
      robotCount: robots.size,
      totalDuration: fights.reduce((total, historicalFight) => total + Number(historicalFight.duration_seconds || 0), 0),
    };
  }, [fights]);
  const robotFightHistory = useMemo(
    () => [fight?.robot_red, fight?.robot_green]
      .filter(Boolean)
      .map((robot) => ({
        robot,
        fights: fights.filter((historicalFight) => (
          historicalFight.robot_red === robot || historicalFight.robot_green === robot
        )),
      })),
    [fight, fights],
  );

  return (
    <main className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Target size={21} /></div>
          <div><strong>HIT<span>TRACK</span></strong><small>Combat intelligence</small></div>
        </div>
        <div className={`topbar-status ${offline ? "is-offline" : ""}`}>
          <span className="status-dot" /> API {offline ? "offline" : "conectada"} <span className="divider" /> Luta #{fightId}
        </div>
      </header>

      <section className="content-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{view === "home" ? "Plataforma de análise" : view === "analytics" ? "Visão histórica e estatística" : view === "new-fight" ? "Cadastro de combate" : "Painel de desempenho"}</p>
            <h1>{view === "home" ? "HitTrack" : view === "analytics" ? "Desempenho agregado" : view === "new-fight" ? "Nova luta" : "Leitura de combate"}</h1>
            <p className="intro">{view === "home" ? "Dados de combate para decisões mais precisas." : view === "analytics" ? "Compare resultados, consistência e ELO por robô e equipe." : view === "new-fight" ? "Preencha os dados da batalha e envie o vídeo para análise." : "Transforme cada impacto em evidência para a próxima decisão da equipe."}</p>
          </div>
          {view !== "analytics" && view !== "new-fight" && <button className="refresh-button" onClick={loadData} disabled={loading} title="Atualizar dados">
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Atualizar
          </button>}
          {view !== "home" && view !== "history" && view !== "analytics" && view !== "new-fight" && <button className="reprocess-button" onClick={startAnalysis} disabled={analyzing}><Radio size={16} /> {analyzing ? "Reprocessando..." : "Reprocessar análise"}</button>}
          {view === "live" && fight?.status !== "encerrada" && <button className="stop-fight-button" onClick={stopFight} disabled={stopping}><StopCircle size={16} /> {stopping ? "Encerrando..." : "Encerrar luta"}</button>}
        </div>

        <nav className="view-tabs" aria-label="Visualizações">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Home size={16} /> Home</button>
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><Activity size={16} /> Análise</button>
          <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}><Radio size={16} /> Ao vivo</button>
          <button className={view === "history" ? "active" : ""} onClick={() => { setView("history"); loadHistory(); }}><History size={16} /> Histórico</button>
          <button className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><ChartNoAxesCombined size={16} /> Desempenho</button>
          <button className={view === "new-fight" ? "active" : ""} onClick={() => setView("new-fight")}><Upload size={16} /> Nova luta</button>
        </nav>

        {offline && <div className="notice"><CircleAlert size={17} /> API offline. Exibindo a última leitura disponível.</div>}
        {view === "new-fight" ? (
          <section className="new-fight-page" aria-label="Cadastro de nova luta">
            <div className="new-fight-card">
              <header className="new-fight-card__heading">
                <span className="section-kicker">Nova luta</span>
                <h2>Dados da luta</h2>
                <p>Identifique os competidores, informe os dados do combate e envie o vídeo para iniciar a análise.</p>
              </header>
              <form className="new-fight-form new-fight-form--page" onSubmit={createFight}>
                <EntityField key={`competition-${formResetKey}`} label="Competição" entityName="competição" options={competitionOptions} value={form.competition} onChange={(value) => setForm((current) => ({ ...current, competition: value }))} />
                <EntityField
                  key={`category-${formResetKey}`}
                  label="Categoria"
                  entityName="categoria"
                  options={Object.keys(CATEGORY_LABELS)}
                  optionLabels={CATEGORY_LABELS}
                  value={form.category}
                  onChange={(value) => setForm((current) => ({ ...current, category: value }))}
                  allowCreate={false}
                  noOptionsLabel="Nenhuma categoria encontrada."
                />
                <EntityField key={`robot-red-${formResetKey}`} label="Robô do lado vermelho" options={robotsForTeam(form.team_red)} value={form.robot_red} onChange={(value) => updateFightRobot("red", value)} />
                <EntityField key={`team-red-${formResetKey}`} label="Equipe do lado vermelho" entityName="equipe" options={teamOptions} value={form.team_red} onChange={(value) => updateFightTeam("red", value)} />
                <EntityField key={`robot-green-${formResetKey}`} label="Robô do lado verde" options={robotsForTeam(form.team_green)} value={form.robot_green} onChange={(value) => updateFightRobot("green", value)} />
                <EntityField key={`team-green-${formResetKey}`} label="Equipe do lado verde" entityName="equipe" options={teamOptions} value={form.team_green} onChange={(value) => updateFightTeam("green", value)} />
                <div><label><span className="field-label">ELO pré-luta vermelho<TooltipHint /></span><input type="number" step="any" value={form.elo_red} onChange={(event) => setForm({ ...form, elo_red: event.target.value })} placeholder="Opcional" /></label></div>
                <div><label><span className="field-label">ELO pré-luta verde<TooltipHint /></span><input type="number" step="any" value={form.elo_green} onChange={(event) => setForm({ ...form, elo_green: event.target.value })} placeholder="Opcional" /></label></div>
                <div className="form-field-full"><label><span className="field-label">FPS <RequiredMark /></span><input required type="number" min="1" value={form.fps} onChange={(event) => setForm({ ...form, fps: event.target.value })} /></label></div>
                <div className="file-field form-field-full"><label><span className="field-label">Vídeo da luta <RequiredMark /></span><input aria-label="Vídeo da luta" key={`video-${formResetKey}`} ref={videoInputRef} required type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm" onChange={(event) => selectFightVideo(event.target.files[0])} /></label><small>{videoDurationLoading ? "Lendo duração do vídeo..." : form.duration_seconds ? `Duração detectada: ${form.duration_seconds} s.` : "Formatos aceitos: MP4, MOV, AVI e WEBM. A duração é identificada automaticamente."}</small></div>
                <div className="fight-form-actions form-field-full">
                  <button className="clear-battle-button" type="button" onClick={clearFightForm} disabled={savingFight}>
                    <Eraser size={14} /> Limpar batalha
                  </button>
                  <button className="submit-fight" disabled={savingFight || offline}>{savingFight ? "Enviando..." : "Criar luta e iniciar análise"}</button>
                </div>
                {fightFormError && <div className="notice fight-form-error form-field-full" role="alert">{fightFormError}</div>}
              </form>
            </div>
          </section>
        ) : view === "history" ? (
          <section className="history-page">
            <div className="history-heading"><div><p className="eyebrow">Memória de combate</p><h2>Lutas anteriores</h2><p className="intro">Cada análise fica registrada para comparação e evolução da equipe.</p></div><span className="history-count">{filteredFights.length} de {fights.length} lutas</span></div>
            <div className="history-filters filter-fields">
              <EntityField label="Robô" entityName="robôs" options={robotOptions} value={robotQuery} onChange={setRobotQuery} optional emptyOptionLabel="Todos os robôs" searchAsValue createLabel="Filtrar por" />
              <EntityField label="Equipe" entityName="equipes" options={teamOptions} value={teamQuery} onChange={setTeamQuery} optional emptyOptionLabel="Todas as equipes" searchAsValue createLabel="Filtrar por" />
              <EntityField label="Competição" entityName="competições" options={competitionOptions} value={competitionQuery} onChange={setCompetitionQuery} optional emptyOptionLabel="Todas as competições" searchAsValue createLabel="Filtrar por" />
            </div>
            <div className="history-list">
              {filteredFights.map((historicalFight) => (
                <article className="history-entry" key={historicalFight.id}>
                  <button className={`history-row ${historicalFight.id === fightId ? "selected" : ""}`} onClick={() => openFight(historicalFight.id)}>
                    <span className="history-id">#{String(historicalFight.id).padStart(2, "0")}</span>
                    <span className="history-robots"><strong>{historicalFight.robot_red}<small>{historicalFight.team_red || "Equipe não informada"}</small></strong><small>vs</small><strong>{historicalFight.robot_green}<small>{historicalFight.team_green || "Equipe não informada"}</small></strong><small className="history-competition"><Trophy size={12} />{historicalFight.competition || "Competição não informada"}</small></span>
                    <span className={`history-result ${historicalFight.status === "encerrada" ? "ended" : ""}`}>
                      {historicalFight.winner_robot
                        ? `${historicalFight.winner_robot} venceu por hits`
                        : historicalFight.status_note?.startsWith("Empate em hits")
                          ? "Empate em hits · avaliar"
                          : historicalFight.status === "encerrada"
                            ? "Luta encerrada"
                            : historicalFight.result || "Em andamento"}
                      {historicalFight.status_note && <small className="history-note">Dados podem estar incompletos</small>}
                    </span>
                    <span className="history-hits"><strong>{historicalFight.total_hits}</strong><small>{CATEGORY_LABELS[historicalFight.category] || "categoria não informada"}</small><small>Duração: {formatDuration(historicalFight.duration_seconds)}</small></span>
                  </button>
                  {historicalFight.video_filename && (
                    <details className="history-video">
                      <summary><Video size={14} /> Assistir vídeo: {historicalFight.video_filename}</summary>
                      <video
                        controls
                        preload="metadata"
                        src={`${API_URL}/api/fights/${historicalFight.id}/video`}
                        aria-label={`Vídeo da luta ${historicalFight.id}`}
                      />
                    </details>
                  )}
                </article>
              ))}
              {!fights.length && <div className="empty-history">Nenhuma luta registrada ainda.</div>}
              {fights.length > 0 && !filteredFights.length && <div className="empty-history">Nenhuma luta corresponde à busca.</div>}
            </div>
          </section>
        ) : view === "home" ? (
          <section className="home-demo">
            <div className="home-demo__hero">
              <div className="home-demo__copy">
                <p className="eyebrow">Inteligência para combate</p>
                <h2>Veja o que cada impacto revela.</h2>
                <p className="home-demo__lead">O HitTrack transforma vídeos de lutas em dados para comparar robôs, entender ritmos ofensivos e tomar decisões com mais evidência.</p>
                <div className="home-actions">
                  <button className="demo-primary" onClick={openLatestFight}>Ver última análise <ChevronRight size={16} /></button>
                  <button className="demo-secondary" onClick={() => setView("history")}><History size={16} /> Ver histórico</button>
                </div>
              </div>
              <div className="home-demo__signal">
                <div className="signal-ring"><Target size={33} /><span>IA</span></div>
                <div className="signal-line" /><span className="signal-caption">dados de combate<br />em contexto</span>
              </div>
            </div>
            <div className="home-stats">
              <div><strong>{historyStats.totalHits}</strong><span>hits analisados</span></div>
              <div><strong>{historyStats.robotCount}</strong><span>robôs comparados</span></div>
              <div><strong>{formatDuration(historyStats.totalDuration)}</strong><span>tempo de vídeo</span></div>
              <div><strong>{fights.length}</strong><span>lutas no histórico</span></div>
            </div>
            <div className="home-flow">
              <div className="home-flow__heading"><p className="eyebrow">Como funciona</p><h3>Do vídeo ao insight</h3></div>
              <div className="flow-steps">
                <article><span>01</span><Upload size={19} /><h3>Envie a luta</h3><p>Cadastre os robôs e envie o vídeo da competição.</p></article>
                <article><span>02</span><Target size={19} /><h3>A IA acompanha</h3><p>O sistema detecta os robôs e registra os eventos do combate.</p></article>
                <article><span>03</span><BarChart3 size={19} /><h3>Leia o padrão</h3><p>Compare hits, ritmo ofensivo e distribuição ao longo da luta.</p></article>
              </div>
            </div>
          </section>
        ) : view === "analytics" ? (
          <AggregateAnalytics
            analytics={analytics}
            loading={analyticsLoading}
            error={analyticsError}
            filters={analyticsFilters}
            robotOptions={robotOptions}
            teamOptions={teamOptions}
            competitionOptions={competitionOptions}
            onFilterChange={updateAnalyticsFilter}
            onClearFilters={() => setAnalyticsFilters({
              startDate: "",
              endDate: "",
              category: "",
              competition: "",
              robot: "",
              team: "",
            })}
            onRefresh={() => loadAnalytics()}
          />
        ) : (
          <>
        {view === "live" && !offline && !analysisStatus.active && (
          <div className="notice"><CircleAlert size={17} /> A análise não está em execução. Clique em <strong>Iniciar análise</strong> para processar o vídeo.</div>
        )}

        {view === "overview" ? (
          <>
            <section className="hero-band">
              <div className="hero-copy">
                <span className="section-kicker"><BarChart3 size={15} /> Resumo da luta</span>
                <h2>{leadingRobot.robot} lidera a ofensiva</h2>
                <p>{leadingRobot.hits} hits registrados em {formatDuration(metrics.duration_seconds)} de combate.</p>
                {fight?.category && <span className="fight-category">{CATEGORY_LABELS[fight.category]}</span>}
                {fight?.status === "encerrada" && <span className="fight-status">Luta encerrada</span>}
                {fight?.status_note && <p className="fight-status-note">{fight.status_note}</p>}
              </div>
              <div className="hero-score"><strong>{metrics.total_hits}</strong><span>hits totais</span></div>
            </section>

            {fight?.status === "encerrada" && (
              <section className="fight-result-panel panel" aria-label="Resultado oficial">
                {fight.winner_robot ? (
                  <>
                    <span className="section-kicker">
                      <Trophy size={15} /> {fight.status_note?.startsWith("Empate em hits") ? "Resultado avaliado" : "Vitória por hits"}
                    </span>
                    <strong>
                      {fight.winner_robot} venceu{fight.status_note?.startsWith("Empate em hits") ? " após avaliação" : ""}
                      {" "}({metrics.robots[0]?.hits ?? 0} a {metrics.robots[1]?.hits ?? 0})
                    </strong>
                  </>
                ) : (
                  <>
                    <span className="section-kicker">
                      <Trophy size={15} /> {fight.status_note?.startsWith("Empate em hits") ? "Empate em hits" : "Resultado não registrado"}
                    </span>
                    <h3>
                      {metrics.robots[0]?.hits ?? 0} a {metrics.robots[1]?.hits ?? 0}
                      {fight.status_note?.startsWith("Empate em hits") ? " — precisa ser avaliado" : " — vencedor não informado"}
                    </h3>
                    <p>
                      {fight.status_note?.startsWith("Empate em hits")
                        ? "Os hits não desempataram. Avalie a luta e registre manualmente quem venceu."
                        : "Registre o vencedor. Se houve empate em hits, avalie a luta manualmente."}
                    </p>
                    {winnerError && <div className="notice" role="alert">{winnerError}</div>}
                    <div className="winner-actions">
                      <button className="winner-button winner-red" onClick={() => recordWinner(fight.robot_red)} disabled={savingWinner}>
                        {savingWinner ? "Salvando..." : `Avaliar: ${fight.robot_red} venceu`}
                      </button>
                      <button className="winner-button winner-green" onClick={() => recordWinner(fight.robot_green)} disabled={savingWinner}>
                        {savingWinner ? "Salvando..." : `Avaliar: ${fight.robot_green} venceu`}
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}

            <form className="fight-elo-panel panel" onSubmit={saveFightElo}>
              <div>
                <span className="section-kicker">Dados para correlação</span>
                <h3 className="fight-elo-title" aria-label="ELO antes da luta">ELO antes da luta<TooltipHint /></h3>
                <p>Cadastre o ELO que cada robô tinha antes deste combate. A correlação exige pelo menos 3 lutas com ELO por robô.</p>
              </div>
              <label>{fight?.robot_red || "Robô vermelho"}<input aria-label={`ELO pré-luta ${fight?.robot_red || "vermelho"}`} type="number" step="any" value={eloForm.elo_red} onChange={(event) => setEloForm((current) => ({ ...current, elo_red: event.target.value }))} /></label>
              <label>{fight?.robot_green || "Robô verde"}<input aria-label={`ELO pré-luta ${fight?.robot_green || "verde"}`} type="number" step="any" value={eloForm.elo_green} onChange={(event) => setEloForm((current) => ({ ...current, elo_green: event.target.value }))} /></label>
              <button className="winner-button" type="submit" disabled={savingElo}>{savingElo ? "Salvando..." : "Salvar ELO"}</button>
              {eloError && <div className="notice" role="alert">{eloError}</div>}
            </form>

            <section className="fight-video-panel panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker"><Video size={15} /> Vídeo da luta</span>
                  <h3>{fight?.video_filename || "Vídeo original"}</h3>
                </div>
                <span className="panel-tag">Fonte da análise</span>
              </div>
              {fight?.video_filename && analysisFinished ? (
                <video
                  className="fight-video"
                  controls
                  preload="metadata"
                  playsInline
                  src={`${API_URL}/api/fights/${fight.id}/video`}
                >
                  Seu navegador não suporta a reprodução de vídeo.
                </video>
              ) : (
                <div className="video-empty-state">
                  <Video size={22} />
                  <span>{fight?.video_filename ? "O vídeo será liberado após o término do ao vivo." : "Esta luta não possui um vídeo associado."}</span>
                </div>
              )}
            </section>

            <section className="metric-grid">
              <MetricCard icon={Target} label="Hits registrados" value={metrics.total_hits} detail="eventos validados pela IA" tone="cyan" />
              <MetricCard icon={Gauge} label="Ritmo ofensivo" value={`${leadingRobot.hits_per_minute}/min`} detail={`${leadingRobot.robot} • maior cadência`} tone="red" />
              <MetricCard icon={Trophy} label="Líder da luta" value={leadingRobot.robot.replace("Robo ", "")} detail={`${leadingRobot.hits} impactos efetivos`} tone="green" />
              <MetricCard icon={Activity} label="Duração analisada" value={formatDuration(metrics.duration_seconds)} detail="janela total do vídeo" />
            </section>

            <section className="analysis-grid">
              <article className="panel distribution-panel">
                <div className="panel-heading"><div><span className="section-kicker">Dinâmica temporal</span><h3>Onde os hits aconteceram</h3></div><span className="panel-tag">3 terços</span></div>
                <DistributionChart robots={metrics.robots} />
              </article>
              <article className="panel comparison-panel">
                <div className="panel-heading"><div><span className="section-kicker">Comparativo</span><h3>Eficiência por robô</h3></div></div>
                {metrics.robots.map((robot, index) => (
                  <div className="robot-row" key={robot.robot}>
                    <div className="robot-name"><i className={`legend-dot dot-${index}`} /><span>{robot.robot}</span></div>
                    <div className="progress-track"><div className={`progress-fill fill-${index}`} style={{ width: `${(robot.hits / Math.max(...metrics.robots.map((item) => item.hits), 1)) * 100}%` }} /></div>
                    <strong>{robot.hits}</strong>
                  </div>
                ))}
                <div className="comparison-foot"><span>Total de impactos</span><strong>{metrics.total_hits}</strong></div>
              </article>
            </section>

            <section className="robot-history-panel panel" aria-label="Histórico dos robôs">
              <div className="panel-heading">
                <div><span className="section-kicker"><History size={15} /> Confrontos registrados</span><h3>Histórico dos robôs</h3></div>
              </div>
              <div className="robot-history-grid">
                {robotFightHistory.map(({ robot, fights: previousFights }) => (
                  <article className="robot-history-group" key={robot}>
                    <h4>{robot}</h4>
                    {previousFights.length ? (
                      <ul>
                        {previousFights.map((historicalFight) => {
                          const opponent = historicalFight.robot_red === robot
                            ? historicalFight.robot_green
                            : historicalFight.robot_red;
                          const outcome = historicalFight.winner_robot === robot
                            ? "win"
                            : historicalFight.winner_robot
                              ? "loss"
                              : historicalFight.status_note?.startsWith("Empate em hits")
                                ? "draw"
                                : "unknown";
                          const outcomeLabel = {
                            win: `${robot} venceu ${opponent}`,
                            loss: `${opponent} venceu ${robot}`,
                            draw: `Empate entre ${robot} e ${opponent}`,
                            unknown: `${robot} vs ${opponent} · Sem resultado`,
                          }[outcome];
                          const fightDate = historicalFight.fought_at || historicalFight.created_at;
                          const formattedDate = fightDate && !Number.isNaN(new Date(fightDate).getTime())
                            ? new Date(fightDate).toLocaleDateString("pt-BR")
                            : "Data não informada";
                          return (
                            <li key={historicalFight.id}>
                              <button type="button" onClick={() => openFight(historicalFight.id)}>
                                <span className={`robot-history-match robot-history-match--${outcome}`}>
                                  <strong>{outcomeLabel}</strong>
                                  <small>{historicalFight.competition || "Competição não informada"} · {formattedDate}</small>
                                </span>
                                <span className="robot-history-result">{historicalFight.total_hits} hits</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="robot-history-empty">Nenhum confronto anterior encontrado.</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="live-grid">
            <article className="video-panel"><div className="panel-heading"><div><span className="section-kicker"><Video size={15} /> Feed da IA</span><h3>Visão superior</h3></div><span className="live-badge"><i /> AO VIVO</span></div><div className="video-frame"><img src={`${API_URL}/stream`} alt="Stream do combate com detecções" /></div></article>
            <aside className="live-score panel"><span className="section-kicker">Placar em tempo real</span><div className="live-number live-red"><small>{redRobotName}</small><strong>{liveHits.lado_vermelho}</strong><span>hits</span></div><div className="live-number live-green"><small>{greenRobotName}</small><strong>{liveHits.lado_verde}</strong><span>hits</span></div><div className="live-total"><span>acumulado</span><strong>{liveTotal}</strong></div></aside>
          </section>
        )}
          </>
        )}

        <footer className="footer-line">Última sincronização: {lastUpdated ? lastUpdated.toLocaleTimeString("pt-BR") : "aguardando dados"}<span>Fonte: HitTrack API</span></footer>
      </section>
    </main>
  );
}
