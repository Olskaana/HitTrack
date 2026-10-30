import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CircleAlert,
  ChevronRight,
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

export default function App() {
  const [view, setView] = useState("home");
  const [fightId, setFightId] = useState(() => Number(localStorage.getItem("hittrack-fight-id")) || DEFAULT_FIGHT_ID);
  const [fight, setFight] = useState(null);
  const [showNewFight, setShowNewFight] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [form, setForm] = useState({ robot_red: "", robot_green: "", team_red: "", team_green: "", category: "", duration_seconds: 120, fps: 30 });
  const [savingFight, setSavingFight] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [liveHits, setLiveHits] = useState({ lado_vermelho: 0, lado_verde: 0 });
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState({ active: false, frame: 0 });
  const [fights, setFights] = useState([]);
  const [robotQuery, setRobotQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");

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
      setFight(await fightResponse.json());
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
    if (!videoFile) return;
    setSavingFight(true);
    try {
      const fightResponse = await fetch(`${API_URL}/api/fights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          robot_red: form.robot_red,
          robot_green: form.robot_green,
          team_red: form.team_red || null,
          team_green: form.team_green || null,
          category: form.category || null,
          duration_seconds: Number(form.duration_seconds),
          fps: Number(form.fps),
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
      setShowNewFight(false);
      setVideoFile(null);
      setForm({ robot_red: "", robot_green: "", team_red: "", team_green: "", category: "", duration_seconds: 120, fps: 30 });
    } catch (error) {
      setOffline(true);
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
      setFight((current) => current ? { ...current, status: stoppedFight.status, status_note: stoppedFight.status_note } : current);
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
    return fights.filter((historicalFight) => {
      const robots = `${historicalFight.robot_red} ${historicalFight.robot_green}`.toLocaleLowerCase();
      const teams = `${historicalFight.team_red || ""} ${historicalFight.team_green || ""}`.toLocaleLowerCase();
      return (!robotTerm || robots.includes(robotTerm)) && (!teamTerm || teams.includes(teamTerm));
    });
  }, [fights, robotQuery, teamQuery]);
  const historyStats = useMemo(() => {
    const robots = new Set(fights.flatMap((historicalFight) => [historicalFight.robot_red, historicalFight.robot_green].filter(Boolean)));
    return {
      totalHits: fights.reduce((total, historicalFight) => total + Number(historicalFight.total_hits || 0), 0),
      robotCount: robots.size,
      totalDuration: fights.reduce((total, historicalFight) => total + Number(historicalFight.duration_seconds || 0), 0),
    };
  }, [fights]);

  return (
    <main className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Target size={21} /></div>
          <div><strong>HIT<span>TRACK</span></strong><small>Combat intelligence</small></div>
        </div>
        <div className="topbar-status"><span className="status-dot" /> API conectada <span className="divider" /> Luta #{fightId}</div>
      </header>

      <section className="content-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{view === "home" ? "Plataforma de análise" : "Painel de desempenho"}</p>
            <h1>{view === "home" ? "HitTrack" : "Leitura de combate"}</h1>
            <p className="intro">{view === "home" ? "Dados de combate para decisões mais precisas." : "Transforme cada impacto em evidência para a próxima decisão da equipe."}</p>
          </div>
          <button className="refresh-button" onClick={loadData} disabled={loading} title="Atualizar dados">
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Atualizar
          </button>
          {view !== "home" && view !== "history" && <button className="reprocess-button" onClick={startAnalysis} disabled={analyzing}><Radio size={16} /> {analyzing ? "Reprocessando..." : "Reprocessar análise"}</button>}
          {view === "live" && fight?.status !== "encerrada" && <button className="stop-fight-button" onClick={stopFight} disabled={stopping}><StopCircle size={16} /> {stopping ? "Encerrando..." : "Encerrar luta"}</button>}
          <button className="new-fight-button" onClick={() => setShowNewFight((current) => !current)}><Upload size={16} /> Nova luta</button>
        </div>

        {showNewFight && (
          <form className="new-fight-form" onSubmit={createFight}>
            <div><label>Robô vermelho<input required value={form.robot_red} onChange={(event) => setForm({ ...form, robot_red: event.target.value })} placeholder="Nome do robô" /></label></div>
            <div><label>Robô verde<input required value={form.robot_green} onChange={(event) => setForm({ ...form, robot_green: event.target.value })} placeholder="Nome do robô" /></label></div>
            <div><label>Equipe vermelha<input value={form.team_red} onChange={(event) => setForm({ ...form, team_red: event.target.value })} placeholder="Nome da equipe" /></label></div>
            <div><label>Equipe verde<input value={form.team_green} onChange={(event) => setForm({ ...form, team_green: event.target.value })} placeholder="Nome da equipe" /></label></div>
            <div><label>Categoria<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="">Selecione</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
            <div><label>Duração (s)<input required type="number" min="1" value={form.duration_seconds} onChange={(event) => setForm({ ...form, duration_seconds: event.target.value })} /></label></div>
            <div><label>FPS<input required type="number" min="1" value={form.fps} onChange={(event) => setForm({ ...form, fps: event.target.value })} /></label></div>
            <div className="file-field"><label>Vídeo da luta<input required type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm" onChange={(event) => setVideoFile(event.target.files[0])} /></label></div>
            <button className="submit-fight" disabled={savingFight}>{savingFight ? "Enviando..." : "Criar e enviar vídeo"}</button>
          </form>
        )}

        <nav className="view-tabs" aria-label="Visualizações">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Home size={16} /> Home</button>
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><Activity size={16} /> Análise</button>
          <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}><Radio size={16} /> Ao vivo</button>
          <button className={view === "history" ? "active" : ""} onClick={() => { setView("history"); loadHistory(); }}><History size={16} /> Histórico</button>
        </nav>

        {offline && <div className="notice"><CircleAlert size={17} /> API offline. Exibindo a última leitura disponível.</div>}
        {view === "history" ? (
          <section className="history-page">
            <div className="history-heading"><div><p className="eyebrow">Memória de combate</p><h2>Lutas anteriores</h2><p className="intro">Cada análise fica registrada para comparação e evolução da equipe.</p></div><span className="history-count">{filteredFights.length} de {fights.length} lutas</span></div>
            <div className="history-filters">
              <label><Search size={15} /><span>Robô</span><input value={robotQuery} onChange={(event) => setRobotQuery(event.target.value)} placeholder="Buscar por robô" /></label>
              <label><Search size={15} /><span>Equipe</span><input value={teamQuery} onChange={(event) => setTeamQuery(event.target.value)} placeholder="Buscar por equipe" /></label>
            </div>
            <div className="history-list">
              {filteredFights.map((historicalFight) => (
                <button className={`history-row ${historicalFight.id === fightId ? "selected" : ""}`} key={historicalFight.id} onClick={() => openFight(historicalFight.id)}>
                  <span className="history-id">#{String(historicalFight.id).padStart(2, "0")}</span>
                  <span className="history-robots"><strong>{historicalFight.robot_red}<small>{historicalFight.team_red || "Equipe não informada"}</small></strong><small>vs</small><strong>{historicalFight.robot_green}<small>{historicalFight.team_green || "Equipe não informada"}</small></strong></span>
                  <span className={`history-result ${historicalFight.status === "encerrada" ? "ended" : ""}`}>
                    {historicalFight.status === "encerrada" ? "Luta encerrada" : historicalFight.result || "Em andamento"}
                    {historicalFight.status_note && <small className="history-note">Dados podem estar incompletos</small>}
                  </span>
                  <span className="history-hits"><strong>{historicalFight.total_hits}</strong><small>{CATEGORY_LABELS[historicalFight.category] || "categoria não informada"}</small></span>
                </button>
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
