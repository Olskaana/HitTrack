import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
const HISTORY_PAGE_SIZE = 10;
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
  is_test: false,
};
const CATEGORY_LABELS = {
  fairyweight: "Fairyweight · 150 g",
  termiteweight: "Cupim · 454 g",
  antweight: "Antweight · 454 g",
  "pastic-ant": "Plastic Ant",
  beetleweight: "Beetleweight · 1,36 kg",
  hobbyweight: "Hobbyweight · 5,44 kg",
  featherweight: "Featherweight · 13,6 kg",
  lightweight: "Lightweight · 27,2 kg",
  middleweight: "Middleweight · 54,4 kg",
  heavyweight: "Heavyweight · 113 kg",
};

const emptyMetrics = {
  fight_id: null,
  duration_seconds: 0,
  total_hits: 0,
  robots: [],
};

function isValidFightId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function getStoredFightId() {
  const storedFightId = Number(localStorage.getItem("hittrack-fight-id"));
  return isValidFightId(storedFightId) ? storedFightId : DEFAULT_FIGHT_ID;
}

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

function TooltipHint({
  label = "o ELO pré-luta",
  placement = "above",
  floating = false,
  children = "  ELO oficial atual da RoboCore na categoria selecionada. Ele é preenchido ao escolher um robô ranqueado e pode ser ajustado manualmente.",
}) {
  const tooltipId = useId();
  const tooltipRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const [tooltipPosition, setTooltipPosition] = useState(null);

  function keepTooltipVisible() {
    window.clearTimeout(hideTimeoutRef.current);
  }

  function scheduleTooltipHide() {
    if (!floating) return;
    window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(() => setTooltipPosition(null), 150);
  }

  function showTooltip(event) {
    if (!floating) return;
    keepTooltipVisible();
    const bounds = event.currentTarget.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 32);
    setTooltipPosition({
      left: Math.max(16, Math.min(bounds.left, window.innerWidth - width - 16)),
      top: bounds.bottom + 8,
      anchorTop: bounds.top,
    });
  }

  useEffect(() => () => window.clearTimeout(hideTimeoutRef.current), []);

  useLayoutEffect(() => {
    if (!tooltipPosition || !tooltipRef.current) return;
    const tooltipBounds = tooltipRef.current.getBoundingClientRect();
    const below = tooltipPosition.top + tooltipBounds.height <= window.innerHeight - 8;
    setTooltipPosition((position) => {
      if (!position) return position;
      const top = below ? position.top : Math.max(8, position.anchorTop - tooltipBounds.height - 8);
      return top === position.top ? position : { ...position, top };
    });
  }, [tooltipPosition?.left, tooltipPosition?.top]);

  const tooltip = (
    <span
      className={`tooltip-hint__content ${floating ? `tooltip-hint__content--floating ${tooltipPosition ? "is-visible" : ""}` : ""}`}
      id={tooltipId}
      role="tooltip"
      ref={floating ? tooltipRef : undefined}
      style={floating && tooltipPosition ? { left: tooltipPosition.left, top: tooltipPosition.top } : undefined}
      onMouseEnter={floating ? keepTooltipVisible : undefined}
      onMouseLeave={floating ? scheduleTooltipHide : undefined}
    >
      {children}
    </span>
  );

  return (
    <span className={`tooltip-hint ${placement === "below" ? "tooltip-hint--below" : ""}`}>
      <button
        type="button"
        aria-label={`Sobre ${label}`}
        aria-describedby={tooltipId}
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleTooltipHide}
        onFocus={showTooltip}
        onBlur={scheduleTooltipHide}
      >
        <CircleHelp size={13} />
      </button>
      {floating ? createPortal(tooltip, document.body) : tooltip}
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

function FightTimelineChart({ robots }) {
  const maximum = Math.max(...robots.flatMap((robot) => robot.hit_timeline || []), 1);
  return (
    <div className="fight-timeline-scroll">
      <div className="fight-timeline-chart" role="img" aria-label="Cadência de hits por robô em dez intervalos da luta">
        {Array.from({ length: 10 }, (_, interval) => (
          <div className="fight-timeline-interval" key={interval}>
            <div className="fight-timeline-bars">
              {robots.map((robot, robotIndex) => {
                const value = robot.hit_timeline?.[interval] ?? 0;
                return (
                  <div className="fight-timeline-bar-column" key={robot.robot}>
                    <span>{value}</span>
                    <div className={`fight-timeline-bar bar-${robotIndex}`} style={{ height: `${Math.max((value / maximum) * 100, value ? 8 : 2)}%` }} />
                  </div>
                );
              })}
            </div>
            <span className="fight-timeline-label">{interval * 10}–{(interval + 1) * 10}%</span>
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

function getPostFightRecommendations(robots) {
  if (robots.length !== 2) return null;

  const distributions = robots.map((robot) => robot.third_distribution);
  if (
    distributions.some(
      (distribution) =>
        !Array.isArray(distribution) ||
        distribution.length !== 3 ||
        distribution.some((hits) => !Number.isFinite(hits) || hits < 0),
    )
  ) {
    return null;
  }

  if (distributions.flat().every((hits) => hits === 0)) return [];

  const periods = ["primeiro terço", "segundo terço", "terceiro terço"];
  return robots.map((robot, index) => {
    const ownHits = distributions[index];
    const opponent = robots[1 - index];
    const opponentHits = distributions[1 - index];
    const recommendations = [];
    const mostActiveHits = Math.max(...ownHits);
    const leastActiveHits = Math.min(...ownHits);

    if (mostActiveHits > leastActiveHits) {
      const periodIndex = ownHits.indexOf(leastActiveHits);
      recommendations.push({
        type: "offense",
        text: `Poderia ter mantido uma pressão ofensiva maior no ${periods[periodIndex]}: registrou ${leastActiveHits} ${leastActiveHits === 1 ? "hit" : "hits"}, contra ${mostActiveHits} no trecho mais ativo.`,
      });
    }

    const defensiveGaps = opponentHits.map((hits, periodIndex) => hits - ownHits[periodIndex]);
    const defensivePeriodIndex = defensiveGaps.indexOf(Math.max(...defensiveGaps));
    if (defensiveGaps[defensivePeriodIndex] > 0) {
      recommendations.push({
        type: "defense",
        text: `${opponent.robot} registrou ${opponentHits[defensivePeriodIndex]} ${opponentHits[defensivePeriodIndex] === 1 ? "hit" : "hits"} no ${periods[defensivePeriodIndex]}, enquanto este robô registrou ${ownHits[defensivePeriodIndex]}; vale revisar a estratégia defensiva nesse trecho.`,
      });
    }

    return { robot: robot.robot, recommendations };
  });
}

function PostFightRecommendations({ robots }) {
  const robotRecommendations = getPostFightRecommendations(robots);

  return (
    <section className="panel post-fight-recommendations" aria-label="Sugestões pós-luta">
      <div className="panel-heading">
        <div><span className="section-kicker">Aprendizados do combate</span><h3>Sugestões para a próxima luta</h3></div>
      </div>
      {robotRecommendations === null ? (
        <p className="post-fight-empty">Não há dados de hits por período suficientes para gerar sugestões.</p>
      ) : robotRecommendations.length === 0 ? (
        <p className="post-fight-empty">Esta luta não registrou hits; não há dados para sugerir melhorias.</p>
      ) : (
        <div className="post-fight-grid">
          {robotRecommendations.map(({ robot, recommendations }) => (
            <article className="post-fight-robot" key={robot}>
              <h4>{robot}</h4>
              {recommendations.length ? (
                <ul>
                  {recommendations.map((recommendation) => (
                    <li className={`post-fight-advice post-fight-advice--${recommendation.type}`} key={recommendation.type}>
                      {recommendation.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="post-fight-empty">Sem um período específico de ataque ou defesa para revisar com os hits registrados.</p>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="post-fight-caveat">
        Sugestões defensivas são apenas indícios: os hits do adversário não confirmam ataques recebidos nem falhas de defesa.
      </p>
    </section>
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

const ANALYTICS_COLORS = ["#f07263", "#8bd89e", "#68e1cc", "#d3a6ff"];

function RobotChartFilter({ label, robots, value, onChange }) {
  return (
    <label className="analytics-chart-filter">
      <span>Robô</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Mais frequentes</option>
        {robots.map((robot) => <option key={robot} value={robot}>{robot}</option>)}
      </select>
    </label>
  );
}

function AnalyticsHitTimeline({ fights }) {
  const [selectedRobot, setSelectedRobot] = useState("");
  const robotStats = new Map();
  let fightsWithTimeline = 0;
  let totalTimelineHits = 0;
  for (const fight of fights) {
    if (!Array.isArray(fight.hit_timeline) || !fight.hit_timeline.length) continue;
    fightsWithTimeline += 1;
    totalTimelineHits += fight.hit_timeline.reduce(
      (total, bucket) => total + bucket.hits_red + bucket.hits_green,
      0,
    );
    for (const [side, robot] of [["red", fight.robot_red], ["green", fight.robot_green]]) {
      if (!robot) continue;
      const stats = robotStats.get(robot) || {
        fights: 0,
        buckets: Array(fight.hit_timeline.length).fill(0),
      };
      stats.fights += 1;
      fight.hit_timeline.forEach((bucket, index) => {
        stats.buckets[index] += bucket[`hits_${side}`] || 0;
      });
      robotStats.set(robot, stats);
    }
  }
  const availableRobots = [...robotStats.entries()]
    .map(([robot, stats]) => ({
      robot,
      averages: stats.buckets.map((hits) => hits / stats.fights),
      appearances: stats.fights,
    }))
    .sort((left, right) => right.appearances - left.appearances || left.robot.localeCompare(right.robot));
  const robots = selectedRobot
    ? availableRobots.filter((robot) => robot.robot === selectedRobot)
    : availableRobots.slice(0, 4);
  const robotOptions = availableRobots.map((robot) => robot.robot);
  if (!robots.length) {
    if (selectedRobot) {
      return (
        <>
          <RobotChartFilter label="Robô do ritmo do combate" robots={robotOptions} value={selectedRobot} onChange={setSelectedRobot} />
          <div className="analytics-empty">Não há série temporal disponível para este robô no recorte atual.</div>
        </>
      );
    }
    if (fights.some((fight) => fight.has_hit_events)) {
      return (
        <>
          <RobotChartFilter label="Robô do ritmo do combate" robots={robotOptions} value={selectedRobot} onChange={setSelectedRobot} />
          <div className="analytics-empty">Há hits registrados, mas a API não retornou o histórico temporal. Atualize o backend para exibir o ritmo.</div>
        </>
      );
    }
    return (
      <>
        <RobotChartFilter label="Robô do ritmo do combate" robots={robotOptions} value={selectedRobot} onChange={setSelectedRobot} />
        <div className="analytics-empty">Não há eventos de hits suficientes para mostrar o ritmo da luta.</div>
      </>
    );
  }
  const maximum = Math.max(...robots.flatMap((robot) => robot.averages), 0.1);
  const x = (index) => 42 + (index / 9) * 425;
  const y = (hits) => 172 - (hits / maximum) * 140;

  return (
    <>
      <RobotChartFilter label="Robô do ritmo do combate" robots={robotOptions} value={selectedRobot} onChange={setSelectedRobot} />
      <svg className="analytics-line-chart" viewBox="0 0 500 220" role="img" aria-label="Média de hits por intervalo da luta">
        <line x1="42" y1="172" x2="467" y2="172" />
        <line x1="42" y1="24" x2="42" y2="172" />
        <text x="5" y="18">Hits</text>
        <text x="8" y="174">0</text>
        <text x="5" y="31">{maximum.toFixed(1)}</text>
        <text x="42" y="202">Início</text>
        <text x="424" y="202">Fim</text>
        {robots.map((robot, robotIndex) => {
          const points = robot.averages.map((hits, index) => `${x(index)},${y(hits)}`).join(" ");
          return (
            <g key={robot.robot}>
              <polyline
                points={points}
                className="analytics-line"
                style={{ stroke: ANALYTICS_COLORS[robotIndex] }}
              />
              {robot.averages.map((hits, index) => (
                <circle
                  key={`${robot.robot}-${index}`}
                  cx={x(index)}
                  cy={y(hits)}
                  r="3"
                  style={{ fill: ANALYTICS_COLORS[robotIndex] }}
                >
                  <title>{`${robot.robot} · ${index * 10}–${(index + 1) * 10}% · média ${hits.toFixed(2)} hits`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="analytics-chart-legend">
        {robots.map((robot, index) => (
          <span key={robot.robot}>
            <i style={{ backgroundColor: ANALYTICS_COLORS[index] }} />{robot.robot} ({robot.appearances} {robot.appearances === 1 ? "luta" : "lutas"})
          </span>
        ))}
      </div>
      <p className="analytics-note">
        {selectedRobot
          ? `${robots[0].appearances} ${robots[0].appearances === 1 ? "luta" : "lutas"} · ${selectedRobot}. Média por intervalo percentual.`
          : `${totalTimelineHits} hits distribuídos em ${fightsWithTimeline} ${fightsWithTimeline === 1 ? "luta" : "lutas"}. Média por intervalo percentual; até 4 robôs com mais participações.`}
      </p>
    </>
  );
}

function FightTrendChart({ fights, robots }) {
  const [selectedRobot, setSelectedRobot] = useState("");
  const datedFights = fights
    .map((fight) => ({
      ...fight,
      timestamp: new Date(fight.fought_at || fight.created_at || "").getTime(),
    }))
    .filter((fight) => Number.isFinite(fight.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp || left.fight_id - right.fight_id);
  const availableRobots = [...robots]
    .sort((left, right) => right.fight_count - left.fight_count || left.robot.localeCompare(right.robot))
  const trackedRobots = selectedRobot
    ? availableRobots.filter((robot) => robot.robot === selectedRobot)
    : availableRobots.slice(0, 4);
  const robotOptions = availableRobots.map((robot) => robot.robot);
  if (!datedFights.length || !trackedRobots.length) {
    return (
      <>
        <RobotChartFilter label="Robô da tendência histórica" robots={robotOptions} value={selectedRobot} onChange={setSelectedRobot} />
        <div className="analytics-empty">
          {selectedRobot
            ? `Não há datas de luta disponíveis para ${selectedRobot} no recorte atual.`
            : "Não há datas suficientes para mostrar a evolução histórica."}
        </div>
      </>
    );
  }
  const maxHits = Math.max(...datedFights.flatMap((fight) => [fight.hits_red, fight.hits_green]), 1);
  const x = (index) => 42 + (index / Math.max(datedFights.length - 1, 1)) * 425;
  const y = (hits) => 172 - (hits / maxHits) * 140;
  const firstDate = new Intl.DateTimeFormat("pt-BR").format(new Date(datedFights[0].timestamp));
  const lastDate = new Intl.DateTimeFormat("pt-BR").format(new Date(datedFights[datedFights.length - 1].timestamp));

  return (
    <>
      <RobotChartFilter label="Robô da tendência histórica" robots={robotOptions} value={selectedRobot} onChange={setSelectedRobot} />
      <svg className="analytics-line-chart" viewBox="0 0 500 220" role="img" aria-label="Evolução de hits por robô ao longo das lutas">
        <line x1="42" y1="172" x2="467" y2="172" />
        <line x1="42" y1="24" x2="42" y2="172" />
        <text x="5" y="18">Hits</text>
        <text x="8" y="174">0</text>
        <text x="5" y="31">{maxHits}</text>
        <text x="42" y="202">{firstDate}</text>
        <text x="425" y="202">{lastDate}</text>
        {trackedRobots.map((robot, robotIndex) => {
          const points = datedFights.flatMap((fight, index) => {
            const hits = fight.robot_red === robot.robot
              ? fight.hits_red
              : fight.robot_green === robot.robot
                ? fight.hits_green
                : null;
            return hits === null ? [] : [{ fight, hits, index }];
          });
          return (
            <g key={robot.robot}>
              {points.length > 1 && (
                <polyline
                  points={points.map((point) => `${x(point.index)},${y(point.hits)}`).join(" ")}
                  className="analytics-line"
                  style={{ stroke: ANALYTICS_COLORS[robotIndex] }}
                />
              )}
              {points.map(({ fight, hits, index }) => (
                <circle
                  key={`${robot.robot}-${fight.fight_id}`}
                  cx={x(index)}
                  cy={y(hits)}
                  r="4"
                  style={{ fill: ANALYTICS_COLORS[robotIndex] }}
                >
                  <title>{`${robot.robot} · ${new Intl.DateTimeFormat("pt-BR").format(new Date(fight.timestamp))} · luta ${fight.fight_id} · ${hits} hits`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="analytics-chart-legend">
        {trackedRobots.map((robot, index) => (
          <span key={robot.robot}>
            <i style={{ backgroundColor: ANALYTICS_COLORS[index] }} />{robot.robot}
          </span>
        ))}
      </div>
      <p className="analytics-note">
        Cada ponto é uma participação em luta; datas de cadastro são usadas quando a data da luta não foi informada.
        {selectedRobot ? ` Exibindo ${selectedRobot}.` : " Até 4 robôs mais frequentes."}
      </p>
    </>
  );
}

function ContextComparisonTable({ fights, field, title }) {
  const groups = new Map();
  for (const fight of fights) {
    const name = fight[field] || "Não informado";
    const stats = groups.get(name) || { fights: 0, hits: 0, participants: 0 };
    stats.fights += 1;
    stats.hits += fight.hits_red + fight.hits_green;
    stats.participants += 2;
    groups.set(name, stats);
  }
  const entries = [...groups.entries()].map(([name, stats]) => ({
    name,
    ...stats,
    averageHits: stats.hits / stats.participants,
  }));

  return (
    <article className="panel analytics-panel analytics-table-panel">
      <div className="panel-heading"><div><span className="section-kicker">Comparação de contexto</span><h3>{title}</h3></div></div>
      <SortablePaginatedTable
        ariaLabel={`de ${title.toLocaleLowerCase()}`}
        itemLabel="Grupos"
        rows={entries}
        getRowKey={(entry) => entry.name}
        defaultSort="name"
        emptyMessage="Não há dados para comparar."
        columns={[
          {
            key: "name",
            label: title,
            sortValue: (entry) => field === "category" ? CATEGORY_LABELS[entry.name] || entry.name : entry.name,
            render: (entry) => field === "category" ? CATEGORY_LABELS[entry.name] || entry.name : entry.name,
          },
          { key: "fights", label: "Lutas" },
          { key: "averageHits", label: "Média de hits/robô", render: (entry) => entry.averageHits.toFixed(2) },
        ]}
      />
      <p className="analytics-note">A média de hits considera os dois robôs participantes de cada luta.</p>
    </article>
  );
}

function AnalyticsDataCoverage({ fights }) {
  const total = fights.length;
  const withHitEvents = fights.filter((fight) => fight.has_hit_events).length;
  const withResult = fights.filter((fight) => fight.outcome_red || fight.outcome_green).length;
  const withElo = fights.filter((fight) => (
    fight.elo_red !== null
    && fight.elo_red !== undefined
    && fight.elo_green !== null
    && fight.elo_green !== undefined
    && Number.isFinite(Number(fight.elo_red))
    && Number.isFinite(Number(fight.elo_green))
  )).length;
  const withDate = fights.filter((fight) => fight.fought_at || fight.created_at).length;
  const coverage = [
    { label: "Com eventos de hits", count: withHitEvents },
    { label: "Com resultado", count: withResult },
    { label: "Com ELO dos dois robôs", count: withElo },
    { label: "Com data", count: withDate },
  ];

  return (
    <article className="panel analytics-panel analytics-table-panel">
      <div className="panel-heading"><div><span className="section-kicker">Confiabilidade do recorte</span><h3>Cobertura dos dados</h3></div></div>
      <div className="analytics-coverage">
        {coverage.map((item) => (
          <div className="analytics-coverage__item" key={item.label}>
            <strong>{item.count}<small>/{total}</small></strong>
            <span>{item.label}</span>
            <div className="analytics-coverage__track"><i style={{ width: `${(item.count / total) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <p className="analytics-note">“Com eventos de hits” significa que há pelo menos um evento armazenado. Sem eventos, não é possível distinguir uma luta sem hits de uma análise ausente ou incompleta.</p>
    </article>
  );
}

function formatMetric(value, suffix = "") {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(2)}${suffix}`;
}

function formatImportedAt(value) {
  if (!value) return "Ranking ainda não importado";
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  return `Atualizado em ${new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp))}`;
}

function calculateFightEloChanges(fight, rankingEntries) {
  const eloRed = Number(fight?.elo_red);
  const eloGreen = Number(fight?.elo_green);
  if (
    !fight?.winner_robot
    || !Number.isFinite(eloRed)
    || !Number.isFinite(eloGreen)
    || !fight.robot_red
    || !fight.robot_green
    || fight.robot_red === fight.robot_green
  ) return null;

  const winnerIsRed = fight.winner_robot === fight.robot_red;
  if (!winnerIsRed && fight.winner_robot !== fight.robot_green) return null;

  const winnerElo = winnerIsRed ? eloRed : eloGreen;
  const loserElo = winnerIsRed ? eloGreen : eloRed;
  const ratingDifference = winnerElo - loserElo;
  const loserExpectedScore = ratingDifference >= 0
    ? (10 ** (-ratingDifference / 600)) / (1 + (10 ** (-ratingDifference / 600)))
    : 1 / (1 + (10 ** (ratingDifference / 600)));
  const points = 35 * loserExpectedScore;
  const redChange = winnerIsRed ? points : -points;
  const greenChange = -redChange;
  const changes = [
    { robot: fight.robot_red, before: eloRed, change: redChange },
    { robot: fight.robot_green, before: eloGreen, change: greenChange },
  ].map((entry) => ({ ...entry, after: entry.before + entry.change }));

  if (!Array.isArray(rankingEntries) || rankingEntries.length === 0) {
    return { changes, positions: null };
  }

  const ratings = new Map(
    rankingEntries
      .filter((entry) => entry.robot_name && Number.isFinite(Number(entry.elo_score)))
      .map((entry) => [entry.robot_name, Number(entry.elo_score)]),
  );
  for (const entry of changes) ratings.set(entry.robot, entry.before);
  const before = [...ratings.entries()]
    .map(([robot, elo]) => ({ robot, elo }))
    .sort((left, right) => right.elo - left.elo || left.robot.localeCompare(right.robot));
  for (const entry of changes) ratings.set(entry.robot, entry.after);
  const after = [...ratings.entries()]
    .map(([robot, elo]) => ({ robot, elo }))
    .sort((left, right) => right.elo - left.elo || left.robot.localeCompare(right.robot));
  const positionOf = (ranking, robot) => ranking.findIndex((entry) => entry.robot === robot) + 1;

  return {
    changes,
    positions: changes.map((entry) => ({
      robot: entry.robot,
      before: positionOf(before, entry.robot),
      after: positionOf(after, entry.robot),
    })),
  };
}

function EloChangeSummary({ fight, rankingEntries, rankingError, rankingLoading }) {
  const result = calculateFightEloChanges(fight, rankingEntries);
  if (!result) {
    return (
      <div className="elo-change-summary" role="status">
        <strong>Variação de ELO indisponível</strong>
        <p>Os dois ELOs pré-luta precisam estar salvos para calcular a mudança.</p>
      </div>
    );
  }

  return (
    <div className="elo-change-summary" aria-label="Simulação da variação de ELO">
      <strong>Variação estimada de ELO</strong>
      <div className="elo-change-summary__robots">
        {result.changes.map((entry) => {
          const position = result.positions?.find((item) => item.robot === entry.robot);
          const movement = position
            ? position.before > position.after
              ? `Subiu ${position.before - position.after} ${position.before - position.after === 1 ? "posição" : "posições"}`
              : position.before < position.after
                ? `Desceu ${position.after - position.before} ${position.after - position.before === 1 ? "posição" : "posições"}`
                : "Manteve a posição"
            : null;
          return (
            <article key={entry.robot} className="elo-change-card" aria-label={`Variação de ELO de ${entry.robot}`}>
              <span>{entry.robot}</span>
              <strong className={entry.change >= 0 ? "elo-change-positive" : "elo-change-negative"}>
                {entry.change >= 0 ? "+" : ""}{entry.change.toFixed(2)} pontos
              </strong>
              <small>{entry.before.toFixed(2)} → {entry.after.toFixed(2)} ELO</small>
              {position && (
                <small className="elo-change-position">
                  Posição estimada: {position.before}º → {position.after}º · {movement}
                </small>
              )}
            </article>
          );
        })}
      </div>
      <p className="elo-change-disclaimer">
        Simulação pela fórmula ELO da RoboCore (K=35). Não altera o ranking oficial.
        {rankingLoading && " Consultando posição estimada..."}
        {rankingError && ` Não foi possível consultar a posição: ${rankingError}`}
        {!rankingLoading && !rankingError && !result.positions && " Posição não estimada: não há snapshot desta categoria disponível."}
      </p>
    </div>
  );
}

function formatDeviation(value, fightCount) {
  if (value !== null && value !== undefined) return formatMetric(value);
  return fightCount < 2 ? `${fightCount}/2 lutas` : "Indisponível";
}

function formatCorrelation(value, observations) {
  if (value !== null && value !== undefined) return formatMetric(value);
  return observations < 3 ? `${observations}/3 pares` : "Indefinida";
}

function SortablePaginatedTable({
  ariaLabel,
  columns,
  rows,
  getRowKey,
  defaultSort,
  itemLabel = "Linhas",
  pageSize = 10,
  emptyMessage = "Nenhum dado disponível.",
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ column: defaultSort, direction: "ascending" });
  const pageCount = Math.ceil(rows.length / pageSize);
  const sortedRows = useMemo(() => {
    const column = columns.find((item) => item.key === sort.column);
    if (!column) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = column.sortValue ? column.sortValue(left) : left[column.key];
      const rightValue = column.sortValue ? column.sortValue(right) : right[column.key];
      const leftMissing = leftValue === null || leftValue === undefined || leftValue === "";
      const rightMissing = rightValue === null || rightValue === undefined || rightValue === "";
      if (!column.compare && (leftMissing || rightMissing)) {
        if (leftMissing && rightMissing) return 0;
        return leftMissing ? 1 : -1;
      }
      let order;
      if (column.compare) {
        order = column.compare(left, right);
      } else if (typeof leftValue === "number" && typeof rightValue === "number") {
        order = leftValue - rightValue;
      } else {
        order = String(leftValue).localeCompare(String(rightValue), "pt-BR", {
          numeric: true,
          sensitivity: "base",
        });
      }
      if (order === 0) return 0;
      return sort.direction === "ascending" ? order : -order;
    });
  }, [columns, rows, sort]);
  const visibleRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  function sortBy(column) {
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === "ascending"
        ? "descending"
        : "ascending",
    }));
    setPage(1);
  }

  return (
    <>
      <div className="analytics-table-scroll">
        <table className="analytics-table">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort.column === column.key;
                const direction = active ? sort.direction : "none";
                const indicator = active ? (direction === "ascending" ? "↑" : "↓") : "↕";
                return (
                  <th key={column.key} aria-sort={direction}>
                    <button
                      type="button"
                      className="ranking-sort-button"
                      onClick={() => sortBy(column.key)}
                      aria-label={`Ordenar por ${column.sortLabel || column.label}`}
                    >
                      {column.label}<span aria-hidden="true">{indicator}</span>
                    </button>
                    {column.help}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column, index) => {
                  const content = column.render
                    ? column.render(row)
                    : row[column.key] ?? "—";
                  return index === 0
                    ? <th key={column.key} scope="row">{content}</th>
                    : <td key={column.key}>{content}</td>;
                })}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={columns.length}>{emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav className="ranking-pagination" aria-label={`Paginação ${ariaLabel}`}>
          <span>
            {itemLabel} {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} de {rows.length}
          </span>
          <div>
            <button type="button" className="winner-button" onClick={() => setPage(1)} disabled={page === 1} aria-label={`Ir para a primeira página ${ariaLabel}`}>Primeira</button>
            <button type="button" className="winner-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label={`Página anterior ${ariaLabel}`}>Anterior</button>
            <span aria-live="polite">Página {page} de {pageCount}</span>
            <button type="button" className="winner-button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} aria-label={`Próxima página ${ariaLabel}`}>Próxima</button>
            <button type="button" className="winner-button" onClick={() => setPage(pageCount)} disabled={page === pageCount} aria-label={`Ir para a última página ${ariaLabel}`}>Última</button>
          </div>
        </nav>
      )}
    </>
  );
}

function RankingBoard({ category, entries, sourceUrl, importedAt, loading, refreshing, error, onCategoryChange, onRefresh }) {
  const [simulatorRedRobot, setSimulatorRedRobot] = useState("");
  const [simulatorGreenRobot, setSimulatorGreenRobot] = useState("");
  const [simulatorWinner, setSimulatorWinner] = useState("");
  const simulatorRobotOptions = entries.map((entry) => entry.robot_name);
  const simulatorRobotLabels = Object.fromEntries(entries.map((entry) => [
    entry.robot_name,
    `${entry.robot_name} · ELO ${formatMetric(entry.elo_score)}`,
  ]));
  const simulatorRedEntry = entries.find((entry) => entry.robot_name === simulatorRedRobot);
  const simulatorGreenEntry = entries.find((entry) => entry.robot_name === simulatorGreenRobot);
  const simulatorFight = simulatorRedEntry && simulatorGreenEntry && simulatorWinner
    ? {
      robot_red: simulatorRedEntry.robot_name,
      robot_green: simulatorGreenEntry.robot_name,
      elo_red: simulatorRedEntry.elo_score,
      elo_green: simulatorGreenEntry.elo_score,
      winner_robot: simulatorWinner,
    }
    : null;

  useEffect(() => {
    setSimulatorRedRobot("");
    setSimulatorGreenRobot("");
    setSimulatorWinner("");
  }, [category]);

  return (
    <section className="ranking-page" aria-label="Ranking RoboCore">
      <div className="analytics-heading">
        <div>
          <p className="eyebrow">Fonte oficial · RoboCore</p>
          <h2>Ranking de robôs por categoria</h2>
          <p className="intro">Pontuação publicada pela RoboCore. Os dados importados são separados das análises de lutas do HitTrack.</p>
          <a className="ranking-source-link" href={sourceUrl} target="_blank" rel="noreferrer">Abrir ranking oficial</a>
        </div>
        <button className="refresh-button" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? "spin" : ""} /> {refreshing ? "Importando..." : "Atualizar ranking"}
        </button>
      </div>
      <div className="ranking-controls">
        <EntityField
          label="Categoria"
          entityName="categoria"
          options={Object.keys(CATEGORY_LABELS)}
          optionLabels={CATEGORY_LABELS}
          value={category}
          onChange={onCategoryChange}
          allowCreate={false}
          noOptionsLabel="Nenhuma categoria encontrada."
        />
        <span className="analytics-count">
          {formatImportedAt(importedAt)}
        </span>
      </div>
      {error && <div className="notice" role="alert">{error}</div>}
      {!loading && entries.length > 0 && (
        <section className="panel elo-simulator" aria-label="Simulador de ELO">
          <div>
            <span className="section-kicker">Simulação sem luta</span>
            <h3>Simule um confronto</h3>
            <p>Escolha dois robôs e um vencedor para estimar a variação de ELO e de posição. Nada será salvo no histórico.</p>
          </div>
          <div className="elo-simulator__controls">
            <EntityField
              label="Robô vermelho da simulação"
              entityName="robô"
              options={simulatorRobotOptions.filter((robot) => robot !== simulatorGreenRobot)}
              optionLabels={simulatorRobotLabels}
              value={simulatorRedRobot}
              onChange={(value) => {
                setSimulatorRedRobot(value);
                setSimulatorWinner("");
              }}
              optional
              emptyOptionLabel="Escolha um robô"
              allowCreate={false}
              noOptionsLabel="Nenhum robô encontrado."
            />
            <EntityField
              label="Robô verde da simulação"
              entityName="robô"
              options={simulatorRobotOptions.filter((robot) => robot !== simulatorRedRobot)}
              optionLabels={simulatorRobotLabels}
              value={simulatorGreenRobot}
              onChange={(value) => {
                setSimulatorGreenRobot(value);
                setSimulatorWinner("");
              }}
              optional
              emptyOptionLabel="Escolha um robô"
              allowCreate={false}
              noOptionsLabel="Nenhum robô encontrado."
            />
            <label>
              Vencedor hipotético
              <select
                aria-label="Vencedor hipotético"
                value={simulatorWinner}
                onChange={(event) => setSimulatorWinner(event.target.value)}
                disabled={!simulatorRedEntry || !simulatorGreenEntry}
              >
                <option value="">Escolha o vencedor</option>
                {simulatorRedEntry && <option value={simulatorRedEntry.robot_name}>{simulatorRedEntry.robot_name}</option>}
                {simulatorGreenEntry && <option value={simulatorGreenEntry.robot_name}>{simulatorGreenEntry.robot_name}</option>}
              </select>
            </label>
          </div>
          {simulatorFight && (
            <EloChangeSummary
              fight={simulatorFight}
              rankingEntries={entries}
              rankingError=""
              rankingLoading={false}
            />
          )}
        </section>
      )}
      {loading ? (
        <div className="analytics-loading" role="status">Carregando ranking...</div>
      ) : entries.length ? (
        <article className="panel analytics-panel analytics-table-panel">
          <SortablePaginatedTable
            ariaLabel="do ranking"
            itemLabel="Robôs"
            rows={entries}
            getRowKey={(entry) => entry.robot_source_id}
            defaultSort="rank_position"
            columns={[
              { key: "rank_position", label: "Posição" },
              {
                key: "robot_name",
                label: "Robô",
                render: (entry) => <a href={entry.robot_url} target="_blank" rel="noreferrer">{entry.robot_name}</a>,
              },
              { key: "team_name", label: "Equipe", render: (entry) => entry.team_name || "—" },
              { key: "elo_score", label: "ELO RoboCore", render: (entry) => formatMetric(entry.elo_score) },
              { key: "total_fights", label: "Lutas" },
              {
                key: "record",
                label: "V / D",
                compare: (left, right) => left.wins - right.wins || left.losses - right.losses,
                render: (entry) => `${entry.wins} / ${entry.losses}`,
              },
              {
                key: "latest_fight_at",
                label: "Última luta",
                sortValue: (entry) => entry.latest_fight_at ? new Date(entry.latest_fight_at).getTime() : null,
                render: (entry) => entry.latest_fight_at
                  ? new Intl.DateTimeFormat("pt-BR").format(new Date(entry.latest_fight_at))
                  : "—",
              },
            ]}
          />
        </article>
      ) : (
        <div className="analytics-empty">Não há um ranking salvo para esta categoria. Use “Atualizar ranking” para importar da RoboCore.</div>
      )}
    </section>
  );
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
          <p className="intro">Por padrão, considera somente lutas reais. Dados de teste ficam separados e podem ser incluídos quando necessário.</p>
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
        <label className="analytics-test-toggle">
          <input
            type="checkbox"
            checked={filters.includeTestData}
            onChange={(event) => onFilterChange("includeTestData", event.target.checked)}
          />
          Incluir lutas de teste
        </label>
        <button className="clear-filters-button" onClick={onClearFilters} disabled={loading}>
          <Eraser size={14} /> Limpar filtros
        </button>
        <span className="analytics-count">
          {loading ? "Atualizando..." : error ? "Falha ao atualizar" : `${analytics?.fight_count ?? 0} lutas no recorte`}
        </span>
      </div>
      {error && <div className="notice" role="alert">{error}</div>}
      {!loading && !error && analytics?.fights?.some((fight) => fight.status_note?.startsWith("Dado fictício de demonstração")) && (
        <div className="notice analytics-synthetic-notice" role="note">
          Este recorte inclui lutas simuladas com robôs, equipes e resultados fictícios; não são registros de combates oficiais.
        </div>
      )}
      {loading && <div className="analytics-loading" role="status">Carregando métricas...</div>}
      {!loading && !error && analytics?.fight_count === 0 && (
        <div className="analytics-empty" role="status">Nenhuma luta corresponde aos filtros selecionados.</div>
      )}
      {!loading && !error && analytics?.fight_count > 0 && (
        <>
          <div className="analytics-chart-grid">
            <article className="panel analytics-panel">
              <div className="panel-heading"><div><span className="section-kicker">Correlação<TooltipHint label="Correlação">Cada ponto representa um robô em uma luta: o ELO pré-luta aparece no eixo horizontal e os hits no vertical. A dispersão ajuda a observar uma relação, mas não demonstra causalidade.</TooltipHint></span><h3>Dispersão ELO × hits</h3></div></div>
              <ScatterPlot fights={analytics.fights} />
              <p className="analytics-note">São necessários ao menos 3 pares válidos de ELO pré-luta e hits por robô. Sem ELO cadastrado, não há pontos nem correlação.</p>
            </article>
            <article className="panel analytics-panel">
              <div className="panel-heading"><div><span className="section-kicker">Distribuição<TooltipHint label="Distribuição">Quantidade de participações de robôs em lutas, agrupadas por total de hits: 0–4, 5–9, 10–19 e 20 ou mais. Os números consideram o recorte filtrado.</TooltipHint></span><h3>Hits por luta e robô</h3></div></div>
              <HitHistogram fights={analytics.fights} />
              <div className="histogram-legend"><span>Quantidade de ocorrências em cada faixa</span></div>
            </article>
          </div>
          <div className="analytics-chart-grid">
            <article className="panel analytics-panel">
              <div className="panel-heading"><div><span className="section-kicker">Ritmo do combate</span><h3>Hits ao longo da luta</h3></div></div>
              <AnalyticsHitTimeline fights={analytics.fights} />
            </article>
            <article className="panel analytics-panel">
              <div className="panel-heading"><div><span className="section-kicker">Evolução histórica</span><h3>Tendência por robô</h3></div></div>
              <FightTrendChart fights={analytics.fights} robots={analytics.robots} />
            </article>
          </div>
          <div className="analytics-chart-grid analytics-context-grid">
            <ContextComparisonTable fights={analytics.fights} field="category" title="Por categoria" />
            <ContextComparisonTable fights={analytics.fights} field="competition" title="Por competição" />
          </div>
          <AnalyticsDataCoverage fights={analytics.fights} />
          <article className="panel analytics-panel analytics-table-panel">
            <div className="panel-heading"><div><span className="section-kicker">Perfil por equipe</span><h3>Resumo e eficácia</h3></div></div>
            <SortablePaginatedTable
              ariaLabel="das equipes"
              itemLabel="Equipes"
              rows={analytics.teams}
              getRowKey={(team) => team.team}
              defaultSort="team"
              emptyMessage="Não há equipes identificadas nas lutas filtradas."
              columns={[
                { key: "team", label: "Equipe" },
                { key: "fight_count", label: "Lutas" },
                { key: "record", label: "V / D", compare: (left, right) => left.wins - right.wins || left.losses - right.losses, render: (team) => `${team.wins} / ${team.losses}` },
                {
                  key: "total_hits",
                  label: "Hits",
                  help: <TooltipHint label="Hits da equipe" placement="below" floating>Total de hits registrados pelos robôs da equipe nas lutas do recorte filtrado.</TooltipHint>,
                },
                {
                  key: "hits_per_minute",
                  label: "Hits/min",
                  help: <TooltipHint label="Hits por minuto" placement="below" floating>Total de hits dividido pela duração total das participações da equipe nas lutas, normalizado para um minuto.</TooltipHint>,
                  render: (team) => formatMetric(team.hits_per_minute),
                },
                {
                  key: "sample_stddev_hits",
                  label: "Desvio padrão",
                  help: <TooltipHint label="Desvio padrão da equipe" placement="below" floating>Indica quanto o total de hits da equipe varia entre as lutas: valores menores indicam resultados mais consistentes, e maiores indicam mais variação. É calculado com as lutas do recorte filtrado e requer ao menos 2 lutas.</TooltipHint>,
                  sortValue: (team) => team.sample_stddev_hits,
                  render: (team) => formatDeviation(team.sample_stddev_hits, team.fight_count),
                },
                {
                  key: "wins_average",
                  label: "Média em vitórias",
                  sortValue: (team) => team.outcomes.find((item) => item.outcome === "vitoria")?.average_hits,
                  render: (team) => formatMetric(team.outcomes.find((item) => item.outcome === "vitoria")?.average_hits),
                },
                {
                  key: "losses_average",
                  label: "Média em derrotas",
                  sortValue: (team) => team.outcomes.find((item) => item.outcome === "derrota")?.average_hits,
                  render: (team) => formatMetric(team.outcomes.find((item) => item.outcome === "derrota")?.average_hits),
                },
              ]}
            />
          </article>
          <article className="panel analytics-panel analytics-table-panel">
            <div className="panel-heading"><div><span className="section-kicker">Perfil individual</span><h3>Robôs, resultados e ELO</h3></div></div>
            <SortablePaginatedTable
              ariaLabel="dos robôs"
              itemLabel="Robôs"
              rows={analytics.robots}
              getRowKey={(robot) => robot.robot}
              defaultSort="robot"
              columns={[
                { key: "robot", label: "Robô" },
                { key: "fight_count", label: "Lutas" },
                { key: "record", label: "V / D", compare: (left, right) => left.wins - right.wins || left.losses - right.losses, render: (robot) => `${robot.wins} / ${robot.losses}` },
                { key: "hits_per_minute", label: "Hits/min", render: (robot) => formatMetric(robot.hits_per_minute) },
                {
                  key: "sample_stddev_hits",
                  label: "Desvio padrão",
                  help: <TooltipHint label="Desvio padrão do robô" placement="below" floating>Indica quanto o total de hits do robô varia entre as lutas: valores menores indicam resultados mais consistentes, e maiores indicam mais variação. É calculado com as lutas do recorte filtrado e requer ao menos 2 lutas.</TooltipHint>,
                  sortValue: (robot) => robot.sample_stddev_hits,
                  render: (robot) => formatDeviation(robot.sample_stddev_hits, robot.fight_count),
                },
                {
                  key: "outcome_average",
                  label: "Média V / D",
                  sortValue: (robot) => robot.average_hits_per_fight,
                  render: (robot) => robot.outcomes.map((item) => formatMetric(item.average_hits)).join(" / "),
                },
                {
                  key: "pearson",
                  label: "Pearson (ELO)",
                  help: <TooltipHint label="Pearson (ELO)" placement="below" floating>Mede a relação linear entre o ELO pré-luta e os hits do robô por luta. Vai de −1 a 1: valores próximos de 1 indicam relação positiva, de −1 negativa e de 0 pouca relação linear. Requer ao menos 3 pares válidos.</TooltipHint>,
                  sortValue: (robot) => robot.elo_correlation.pearson,
                  render: (robot) => formatCorrelation(robot.elo_correlation.pearson, robot.elo_correlation.observations),
                },
                {
                  key: "spearman",
                  label: "Spearman (ELO)",
                  help: <TooltipHint label="Spearman (ELO)" placement="below" floating>Mede se ELO e hits tendem a aumentar ou diminuir juntos, comparando suas posições (postos) em vez dos valores. Vai de −1 a 1 e requer ao menos 3 pares válidos.</TooltipHint>,
                  sortValue: (robot) => robot.elo_correlation.spearman,
                  render: (robot) => formatCorrelation(robot.elo_correlation.spearman, robot.elo_correlation.observations),
                },
              ]}
            />
          </article>
        </>
      )}
    </section>
  );
}

export default function App() {
  const [view, setView] = useState("home");
  const [fightId, setFightId] = useState(getStoredFightId);
  const [fight, setFight] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [form, setForm] = useState(EMPTY_FIGHT_FORM);
  const [formResetKey, setFormResetKey] = useState(0);
  const [savingFight, setSavingFight] = useState(false);
  const [fightFormError, setFightFormError] = useState("");
  const [fightRankingEntries, setFightRankingEntries] = useState([]);
  const [fightRankingCategories, setFightRankingCategories] = useState({});
  const [fightRankingLoading, setFightRankingLoading] = useState(false);
  const [fightRankingError, setFightRankingError] = useState("");
  const [videoDurationLoading, setVideoDurationLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const videoInputRef = useRef(null);
  const videoObjectUrlRef = useRef(null);
  const videoSelectionIdRef = useRef(0);
  const fightRankingRequestIdRef = useRef(0);
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
  const [historyPage, setHistoryPage] = useState(1);
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
    includeTestData: false,
  });
  const [rankingCategory, setRankingCategory] = useState("antweight");
  const [ranking, setRanking] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingRefreshing, setRankingRefreshing] = useState(false);
  const [rankingError, setRankingError] = useState("");
  const [winnerError, setWinnerError] = useState("");
  const [savingWinner, setSavingWinner] = useState(false);
  const [fightResultRanking, setFightResultRanking] = useState(null);
  const [fightResultRankingError, setFightResultRankingError] = useState("");
  const [fightResultRankingLoading, setFightResultRankingLoading] = useState(false);
  const [eloForm, setEloForm] = useState({ elo_red: "", elo_green: "" });
  const [eloError, setEloError] = useState("");
  const [savingElo, setSavingElo] = useState(false);
  const robotOptions = useMemo(
    () => [...new Set([
      ...fights.filter((item) => !item.is_test).flatMap((item) => [item.robot_red, item.robot_green]),
      ...fightRankingEntries.map((entry) => entry.robot_name),
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [fights, fightRankingEntries],
  );
  const teamOptions = useMemo(
    () => [...new Set([
      ...fights.filter((item) => !item.is_test).flatMap((item) => [item.team_red, item.team_green]),
      ...fightRankingEntries.map((entry) => entry.team_name),
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [fights, fightRankingEntries],
  );
  const analyticsRobotOptions = useMemo(
    () => [...new Set([
      ...fights.flatMap((item) => [item.robot_red, item.robot_green]),
      ...fightRankingEntries.map((entry) => entry.robot_name),
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [fights, fightRankingEntries],
  );
  const analyticsTeamOptions = useMemo(
    () => [...new Set([
      ...fights.flatMap((item) => [item.team_red, item.team_green]),
      ...fightRankingEntries.map((entry) => entry.team_name),
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [fights, fightRankingEntries],
  );
  const competitionOptions = useMemo(
    () => [...new Set(fights.map((item) => item.competition).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [fights],
  );
  const teamsByRobot = useMemo(() => {
    const associations = new Map();
    for (const historicalFight of fights.filter((item) => !item.is_test)) {
      for (const [robot, team] of [
        [historicalFight.robot_red, historicalFight.team_red],
        [historicalFight.robot_green, historicalFight.team_green],
      ]) {
        if (!robot || !team) continue;
        if (!associations.has(robot)) associations.set(robot, new Set());
        associations.get(robot).add(team);
      }
    }
    for (const entry of fightRankingEntries) {
      if (!entry.team_name) continue;
      if (!associations.has(entry.robot_name)) associations.set(entry.robot_name, new Set());
      associations.get(entry.robot_name).add(entry.team_name);
    }
    return associations;
  }, [fightRankingEntries, fights]);
  const fightRankingByRobot = useMemo(
    () => new Map(fightRankingEntries.map((entry) => [entry.robot_name, entry])),
    [fightRankingEntries],
  );
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
    setFightRankingEntries([]);
    setFightRankingLoading(false);
    setFightRankingError("");
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
    fightRankingRequestIdRef.current += 1;
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
    const eloField = side === "red" ? "elo_red" : "elo_green";
    const rankingEntry = fightRankingByRobot.get(robot);
    setForm((current) => {
      const associatedTeams = [...(teamsByRobot.get(robot) || [])];
      const matchingCurrentTeam = !rankingEntry && associatedTeams.includes(current[teamField])
        ? current[teamField]
        : "";
      const team = rankingEntry?.team_name || matchingCurrentTeam || associatedTeams[0] || "";
      return {
        ...current,
        [side === "red" ? "robot_red" : "robot_green"]: robot,
        [eloField]: rankingEntry ? String(rankingEntry.elo_score) : "",
        ...(associatedTeams.length || robotOptions.includes(robot) ? { [teamField]: team } : {}),
      };
    });
  }

  async function selectFightCategory(category) {
    const requestId = ++fightRankingRequestIdRef.current;
    setForm((current) => ({
      ...current,
      category,
      elo_red: "",
      elo_green: "",
    }));
    setFightRankingEntries([]);
    setFightRankingError("");
    if (!category) return;
    if (fightRankingCategories[category]) {
      const entries = fightRankingCategories[category];
      const rankingByRobot = new Map(entries.map((entry) => [entry.robot_name, entry]));
      setFightRankingEntries(entries);
      setForm((current) => ({
        ...current,
        elo_red: rankingByRobot.has(current.robot_red) ? String(rankingByRobot.get(current.robot_red).elo_score) : "",
        elo_green: rankingByRobot.has(current.robot_green) ? String(rankingByRobot.get(current.robot_green).elo_score) : "",
        team_red: rankingByRobot.get(current.robot_red)?.team_name || current.team_red,
        team_green: rankingByRobot.get(current.robot_green)?.team_name || current.team_green,
      }));
      setFightRankingLoading(false);
      return;
    }

    setFightRankingLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/rankings?category=${encodeURIComponent(category)}`,
      );
      if (!response.ok) throw new Error("Não foi possível carregar os robôs e ELOs desta categoria.");
      const payload = await response.json();
      const entries = payload.entries || [];
      setFightRankingCategories((current) => ({ ...current, [category]: entries }));
      if (requestId === fightRankingRequestIdRef.current) {
        const rankingByRobot = new Map(entries.map((entry) => [entry.robot_name, entry]));
        setFightRankingEntries(entries);
        setForm((current) => ({
          ...current,
          elo_red: rankingByRobot.has(current.robot_red) ? String(rankingByRobot.get(current.robot_red).elo_score) : "",
          elo_green: rankingByRobot.has(current.robot_green) ? String(rankingByRobot.get(current.robot_green).elo_score) : "",
          team_red: rankingByRobot.get(current.robot_red)?.team_name || current.team_red,
          team_green: rankingByRobot.get(current.robot_green)?.team_name || current.team_green,
        }));
      }
    } catch (error) {
      if (requestId === fightRankingRequestIdRef.current) setFightRankingError(error.message);
    } finally {
      if (requestId === fightRankingRequestIdRef.current) setFightRankingLoading(false);
    }
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
      const history = await response.json();
      if (!Array.isArray(history)) throw new Error("Formato de histórico inválido");
      setFights(history.filter(
        (historicalFight) => historicalFight
          && typeof historicalFight === "object"
          && isValidFightId(historicalFight.id),
      ));
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
    if (analyticsFilters.includeTestData) params.set("include_test_data", "true");
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
    void loadData();
    void loadHistory();
    const metricsInterval = setInterval(() => {
      void loadData();
    }, 5000);
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

  const loadRanking = useCallback(async (signal) => {
    setRankingLoading(true);
    setRankingError("");
    try {
      const response = await fetch(
        `${API_URL}/api/rankings?category=${encodeURIComponent(rankingCategory)}`,
        { signal },
      );
      if (!response.ok) throw new Error("Não foi possível carregar o ranking salvo.");
      setRanking(await response.json());
    } catch (error) {
      if (error.name !== "AbortError") setRankingError(error.message);
    } finally {
      if (!signal?.aborted) setRankingLoading(false);
    }
  }, [rankingCategory]);

  useEffect(() => {
    if (view !== "ranking") return undefined;
    const controller = new AbortController();
    loadRanking(controller.signal);
    return () => controller.abort();
  }, [view, loadRanking]);

  useEffect(() => {
    if (!fight?.winner_robot || !fight.category) {
      setFightResultRanking(null);
      setFightResultRankingError("");
      setFightResultRankingLoading(false);
      return undefined;
    }

    const cachedEntries = fightRankingCategories[fight.category];
    if (cachedEntries) {
      setFightResultRanking(cachedEntries);
      setFightResultRankingError("");
      setFightResultRankingLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setFightResultRanking(null);
    setFightResultRankingError("");
    setFightResultRankingLoading(true);
    async function loadFightResultRanking() {
      try {
        const response = await fetch(
          `${API_URL}/api/rankings?category=${encodeURIComponent(fight.category)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Não foi possível consultar o ranking desta categoria.");
        const payload = await response.json();
        if (controller.signal.aborted) return;
        const entries = payload.entries || [];
        setFightResultRanking(entries);
        setFightRankingCategories((current) => ({ ...current, [fight.category]: entries }));
      } catch (error) {
        if (error.name !== "AbortError") setFightResultRankingError(error.message);
      } finally {
        if (!controller.signal.aborted) setFightResultRankingLoading(false);
      }
    }
    loadFightResultRanking();
    return () => controller.abort();
  }, [fight?.category, fight?.winner_robot, fightRankingCategories]);

  async function refreshRanking() {
    setRankingRefreshing(true);
    setRankingError("");
    try {
      const response = await fetch(
        `${API_URL}/api/rankings/refresh?category=${encodeURIComponent(rankingCategory)}`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Não foi possível importar o ranking.");
      setRanking(payload);
    } catch (error) {
      setRankingError(error.message);
    } finally {
      setRankingRefreshing(false);
    }
  }

  function updateAnalyticsFilter(field, value) {
    setAnalyticsFilters((current) => ({ ...current, [field]: value }));
  }

  function openFight(selectedFightId) {
    if (!isValidFightId(selectedFightId)) {
      console.error(new Error("ID de luta inválido"));
      return;
    }
    setFightId(selectedFightId);
    localStorage.setItem("hittrack-fight-id", String(Number(selectedFightId)));
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
      setFightFormError("Não foi possível criar a luta: a API está offline. Verifique a conexão e tente novamente.");
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
        throw new Error("Não foi possível criar a luta: a API está offline. Verifique a conexão e tente novamente.");
      }
      if (!healthResponse.ok) {
        setOffline(true);
        throw new Error("Não foi possível criar a luta: a API está offline. Verifique a conexão e tente novamente.");
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
          is_test: Boolean(form.is_test),
        }),
      });
      if (!fightResponse.ok) throw new Error("Não foi possível criar a luta");
      const fight = await fightResponse.json();
      if (!isValidFightId(fight?.id)) throw new Error("ID de luta inválido");
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
  const historyPageCount = Math.max(1, Math.ceil(filteredFights.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const paginatedFights = filteredFights.slice(
    (currentHistoryPage - 1) * HISTORY_PAGE_SIZE,
    currentHistoryPage * HISTORY_PAGE_SIZE,
  );
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
            <p className="eyebrow">{view === "home" ? "Plataforma de análise" : view === "analytics" ? "Visão histórica e estatística" : view === "ranking" ? "Dados oficiais importados" : view === "new-fight" ? "Cadastro de combate" : "Painel de desempenho"}</p>
            <h1>{view === "home" ? "HitTrack" : view === "analytics" ? "Desempenho agregado" : view === "ranking" ? "Ranking RoboCore" : view === "new-fight" ? "Nova luta" : "Leitura de combate"}</h1>
            <p className="intro">{view === "home" ? "Dados de combate para decisões mais precisas." : view === "analytics" ? "Compare resultados, consistência e ELO por robô e equipe." : view === "ranking" ? "Consulte o ranking oficial da RoboCore por categoria." : view === "new-fight" ? "Preencha os dados da batalha e envie o vídeo para análise." : "Transforme cada impacto em evidência para a próxima decisão da equipe."}</p>
          </div>
          {view !== "analytics" && view !== "ranking" && view !== "new-fight" && <button className="refresh-button" onClick={loadData} disabled={loading} title="Atualizar dados">
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Atualizar
          </button>}
          {view !== "home" && view !== "history" && view !== "analytics" && view !== "new-fight" && <button className="reprocess-button" onClick={startAnalysis} disabled={analyzing}><Radio size={16} /> {analyzing ? "Reprocessando..." : "Reprocessar análise"}</button>}
          {view === "live" && fight?.status !== "encerrada" && <button className="stop-fight-button" onClick={stopFight} disabled={stopping}><StopCircle size={16} /> {stopping ? "Encerrando..." : "Encerrar luta"}</button>}
        </div>

        <nav className="view-tabs" aria-label="Visualizações">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Home size={16} /> Home</button>
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><Activity size={16} /> Análise</button>
          <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}><Radio size={16} /> Ao vivo</button>
          <button className={view === "history" ? "active" : ""} onClick={() => { setView("history"); void loadHistory(); }}><History size={16} /> Histórico</button>
          <button className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><ChartNoAxesCombined size={16} /> Desempenho</button>
          <button className={view === "ranking" ? "active" : ""} onClick={() => setView("ranking")}><Trophy size={16} /> Ranking</button>
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
                  onChange={selectFightCategory}
                  allowCreate={false}
                  noOptionsLabel="Nenhuma categoria encontrada."
                />
                {fightRankingLoading && <div className="ranking-form-status form-field-full" role="status">Carregando robôs e ELO oficial da categoria...</div>}
                {fightRankingError && <div className="notice form-field-full" role="alert">{fightRankingError}</div>}
                <EntityField key={`robot-red-${formResetKey}`} label="Robô do lado vermelho" options={[...new Set([...robotsForTeam(form.team_red), ...fightRankingEntries.map((entry) => entry.robot_name)])]} value={form.robot_red} onChange={(value) => updateFightRobot("red", value)} />
                <EntityField key={`team-red-${formResetKey}`} label="Equipe do lado vermelho" entityName="equipe" options={teamOptions} value={form.team_red} onChange={(value) => updateFightTeam("red", value)} />
                <EntityField key={`robot-green-${formResetKey}`} label="Robô do lado verde" options={[...new Set([...robotsForTeam(form.team_green), ...fightRankingEntries.map((entry) => entry.robot_name)])]} value={form.robot_green} onChange={(value) => updateFightRobot("green", value)} />
                <EntityField key={`team-green-${formResetKey}`} label="Equipe do lado verde" entityName="equipe" options={teamOptions} value={form.team_green} onChange={(value) => updateFightTeam("green", value)} />
                <div><label><span className="field-label">ELO pré-luta vermelho<TooltipHint /></span><input type="number" step="any" value={form.elo_red} onChange={(event) => setForm({ ...form, elo_red: event.target.value })} placeholder="Opcional" /></label></div>
                <div><label><span className="field-label">ELO pré-luta verde<TooltipHint /></span><input type="number" step="any" value={form.elo_green} onChange={(event) => setForm({ ...form, elo_green: event.target.value })} placeholder="Opcional" /></label></div>
                <div className="form-field-full"><label><span className="field-label">FPS <RequiredMark /></span><input required type="number" min="1" value={form.fps} onChange={(event) => setForm({ ...form, fps: event.target.value })} /></label></div>
                <div className="file-field form-field-full"><label><span className="field-label">Vídeo da luta <RequiredMark /></span><input aria-label="Vídeo da luta" key={`video-${formResetKey}`} ref={videoInputRef} required type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm" onChange={(event) => selectFightVideo(event.target.files[0])} /></label><small>{videoDurationLoading ? "Lendo duração do vídeo..." : form.duration_seconds ? `Duração detectada: ${form.duration_seconds} s.` : "Formatos aceitos: MP4, MOV, AVI e WEBM. A duração é identificada automaticamente."}</small></div>
                <label className="fight-test-toggle form-field-full">
                  <input
                    type="checkbox"
                    checked={form.is_test}
                    onChange={(event) => setForm((current) => ({ ...current, is_test: event.target.checked }))}
                  />
                  Marcar como luta de teste (excluída do desempenho real)
                </label>
                <div className="fight-form-actions form-field-full">
                  <button className="clear-battle-button" type="button" onClick={clearFightForm} disabled={savingFight}>
                    <Eraser size={14} /> Limpar batalha
                  </button>
                  <button className="submit-fight" type="submit" disabled={savingFight}>{savingFight ? "Enviando..." : "Criar luta e iniciar análise"}</button>
                </div>
                {fightFormError && <div className="notice fight-form-error form-field-full" role="alert">{fightFormError}</div>}
              </form>
            </div>
          </section>
        ) : view === "history" ? (
          <section className="history-page">
            <div className="history-heading"><div><p className="eyebrow">Memória de combate</p><h2>Lutas anteriores</h2><p className="intro">Cada análise fica registrada para comparação e evolução da equipe.</p></div><span className="history-count">{filteredFights.length} de {fights.length} lutas</span></div>
            <div className="history-filters filter-fields">
              <EntityField label="Robô" entityName="robôs" options={robotOptions} value={robotQuery} onChange={(value) => { setRobotQuery(value); setHistoryPage(1); }} optional emptyOptionLabel="Todos os robôs" searchAsValue createLabel="Filtrar por" />
              <EntityField label="Equipe" entityName="equipes" options={teamOptions} value={teamQuery} onChange={(value) => { setTeamQuery(value); setHistoryPage(1); }} optional emptyOptionLabel="Todas as equipes" searchAsValue createLabel="Filtrar por" />
              <EntityField label="Competição" entityName="competições" options={competitionOptions} value={competitionQuery} onChange={(value) => { setCompetitionQuery(value); setHistoryPage(1); }} optional emptyOptionLabel="Todas as competições" searchAsValue createLabel="Filtrar por" />
            </div>
            <div className="history-list">
              {paginatedFights.map((historicalFight) => (
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
                      {historicalFight.is_test && <small className="history-note">Dado de teste · fora do desempenho real</small>}
                      {historicalFight.status_note?.startsWith("Dado fictício de demonstração")
                        ? <small className="history-note">Dado fictício · não oficial</small>
                        : historicalFight.status_note && <small className="history-note">Dados podem estar incompletos</small>}
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
            {historyPageCount > 1 && (
              <nav className="history-pagination" aria-label="Paginação do histórico">
                <span aria-live="polite">
                  Exibindo {(currentHistoryPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(currentHistoryPage * HISTORY_PAGE_SIZE, filteredFights.length)} de {filteredFights.length} lutas
                </span>
                <div>
                  <button type="button" className="winner-button" onClick={() => setHistoryPage(1)} disabled={currentHistoryPage === 1} aria-label="Primeira página do histórico">Primeira</button>
                  <button type="button" className="winner-button" onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} disabled={currentHistoryPage === 1} aria-label="Página anterior do histórico">Anterior</button>
                  <span aria-live="polite">Página {currentHistoryPage} de {historyPageCount}</span>
                  <button type="button" className="winner-button" onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))} disabled={currentHistoryPage === historyPageCount} aria-label="Próxima página do histórico">Próxima</button>
                  <button type="button" className="winner-button" onClick={() => setHistoryPage(historyPageCount)} disabled={currentHistoryPage === historyPageCount} aria-label="Última página do histórico">Última</button>
                </div>
              </nav>
            )}
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
            robotOptions={analyticsRobotOptions}
            teamOptions={analyticsTeamOptions}
            competitionOptions={competitionOptions}
            onFilterChange={updateAnalyticsFilter}
            onClearFilters={() => setAnalyticsFilters({
              startDate: "",
              endDate: "",
              category: "",
              competition: "",
              robot: "",
              team: "",
              includeTestData: false,
            })}
            onRefresh={() => loadAnalytics()}
          />
        ) : view === "ranking" ? (
          <RankingBoard
            category={rankingCategory}
            entries={ranking?.entries || []}
            sourceUrl={ranking?.source_url || `https://rank.robocore.net/${rankingCategory}`}
            importedAt={ranking?.imported_at}
            loading={rankingLoading}
            refreshing={rankingRefreshing}
            error={rankingError}
            onCategoryChange={setRankingCategory}
            onRefresh={refreshRanking}
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
                    <EloChangeSummary
                      fight={fight}
                      rankingEntries={fightResultRanking}
                      rankingError={fightResultRankingError}
                      rankingLoading={fightResultRankingLoading}
                    />
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

            {fight?.status === "encerrada" && (
              <PostFightRecommendations robots={metrics.robots} />
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
              {fight?.video_filename && (fight.status === "encerrada" || analysisFinished) ? (
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
                    <small>{robot.hits_per_minute}/min · {metrics.total_hits ? ((robot.hits / metrics.total_hits) * 100).toFixed(1) : "0.0"}% dos hits</small>
                  </div>
                ))}
                <div className="comparison-foot"><span>Total de impactos</span><strong>{metrics.total_hits}</strong></div>
              </article>
            </section>

            <section className="panel fight-timeline-panel">
              <div className="panel-heading">
                <div><span className="section-kicker">Ritmo do combate</span><h3>Cadência por intervalo</h3></div>
                <span className="panel-tag">10 intervalos</span>
              </div>
              <FightTimelineChart robots={metrics.robots} />
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
