import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.jsx";

const fights = [
  {
    id: 1,
    competition: "Copa Regional",
    robot_red: "Robo Alfa",
    robot_green: "Robo Beta",
    team_red: "Equipe Alfa",
    team_green: "Equipe Beta",
    category: "antweight",
    status: "encerrada",
    result: "vitoria",
    winner_robot: "Robo Alfa",
    total_hits: 7,
    duration_seconds: 120,
  },
  {
    id: 2,
    competition: "Desafio Nacional",
    robot_red: "Robo Gamma",
    robot_green: "Robo Delta",
    team_red: "Equipe Gamma",
    team_green: "Equipe Delta",
    category: "beetleweight",
    status: "em_andamento",
    result: null,
    total_hits: 3,
    duration_seconds: 30,
  },
];

const fight = {
  id: 1,
  robot_red: "Robo Alfa",
  robot_green: "Robo Beta",
  team_red: "Equipe Alfa",
  team_green: "Equipe Beta",
  category: "antweight",
  status: "encerrada",
  video_filename: null,
};

const metrics = {
  fight_id: 1,
  duration_seconds: 120,
  total_hits: 7,
  robots: [
    { robot: "Robo Alfa", hits: 5, hits_per_minute: 2.5, third_distribution: [2, 2, 1], hit_timeline: [1, 0, 1, 0, 1, 0, 0, 0, 1, 1] },
    { robot: "Robo Beta", hits: 2, hits_per_minute: 1, third_distribution: [1, 0, 1], hit_timeline: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1] },
  ],
};

const analytics = {
  fight_count: 1,
  start_date: "2026-05-12",
  end_date: "2026-05-12",
  category: "antweight",
  competition: "Copa",
  robots: [
    {
      robot: "Robo A",
      fight_count: 1,
      wins: 1,
      losses: 0,
      total_hits: 2,
      average_hits_per_fight: 2,
      hits_per_minute: 2,
      sample_stddev_hits: null,
      outcomes: [
        { outcome: "vitoria", fight_count: 1, average_hits: 2 },
        { outcome: "derrota", fight_count: 0, average_hits: 0 },
      ],
      elo_correlation: { observations: 1, pearson: null, spearman: null },
    },
    {
      robot: "Robo B",
      fight_count: 1,
      wins: 0,
      losses: 1,
      total_hits: 1,
      average_hits_per_fight: 1,
      hits_per_minute: 1,
      sample_stddev_hits: null,
      outcomes: [
        { outcome: "vitoria", fight_count: 0, average_hits: 0 },
        { outcome: "derrota", fight_count: 1, average_hits: 1 },
      ],
      elo_correlation: { observations: 1, pearson: null, spearman: null },
    },
  ],
  teams: [
    {
      team: "Equipe A",
      fight_count: 1,
      wins: 1,
      losses: 0,
      total_hits: 2,
      average_hits_per_fight: 2,
      hits_per_minute: 2,
      sample_stddev_hits: null,
      robot_count: 1,
      outcomes: [
        { outcome: "vitoria", fight_count: 1, average_hits: 2 },
        { outcome: "derrota", fight_count: 0, average_hits: 0 },
      ],
    },
  ],
  fights: [
    {
      fight_id: 1,
      fought_at: "2026-05-12T00:00:00",
      category: "antweight",
      competition: "Copa",
      robot_red: "Robo A",
      robot_green: "Robo B",
      team_red: "Equipe A",
      team_green: "Equipe B",
      hits_red: 2,
      hits_green: 1,
      elo_red: 1000,
      elo_green: 900,
      outcome_red: "vitoria",
      outcome_green: "derrota",
      created_at: null,
      status_note: null,
      has_hit_events: true,
      hit_timeline: Array.from({ length: 10 }, (_, interval) => ({
        interval,
        hits_red: interval === 0 ? 2 : 0,
        hits_green: interval === 5 ? 1 : 0,
      })),
    },
  ],
};

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function mockApi(respond = defaultApiResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => Promise.resolve(respond(String(url), options))),
  );
}

function defaultApiResponse(path) {
  if (path === "http://127.0.0.1:8000/") return jsonResponse({ status: "backend alive" });
  if (path.startsWith("http://127.0.0.1:8000/api/rankings?category=")) return jsonResponse({ entries: [] });
  if (path === "http://127.0.0.1:8000/api/fights") return jsonResponse(fights);
  if (path === "http://127.0.0.1:8000/api/fights/1") return jsonResponse(fight);
  if (path === "http://127.0.0.1:8000/api/fights/1/metrics") return jsonResponse(metrics);
  if (path === "http://127.0.0.1:8000/api/fights/2") return jsonResponse({ ...fight, ...fights[1] });
  if (path === "http://127.0.0.1:8000/api/fights/2/metrics") return jsonResponse(metrics);
  if (path === "http://127.0.0.1:8000/api/fights/3") return jsonResponse({ ...fight, id: 3 });
  if (path === "http://127.0.0.1:8000/api/fights/3/metrics") return jsonResponse(metrics);
  if (path === "http://127.0.0.1:8000/hits") {
    return jsonResponse({ lado_vermelho: 2, lado_verde: 1 });
  }
  if (path === "http://127.0.0.1:8000/analysis/status") {
    return jsonResponse({ active: false, frame: 0 });
  }
  return jsonResponse({}, 404);
}

function clickTab(name) {
  fireEvent.click(
    within(document.querySelector(".view-tabs")).getByRole("button", { name }),
  );
}

function enterNewEntity(label, value) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  const search = screen.getByRole("searchbox", { name: `Buscar ${label.toLocaleLowerCase()}` });
  fireEvent.change(search, { target: { value } });
  fireEvent.click(screen.getByRole("option", { name: `Cadastrar “${value}”` }));
}

function selectFightVideo(file, duration = 61.5) {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-video");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function loadVideoMetadata() {
    Object.defineProperty(this, "duration", { configurable: true, value: duration });
    this.dispatchEvent(new Event("loadedmetadata"));
  });
  fireEvent.change(screen.getByLabelText("Vídeo da luta"), { target: { files: [file] } });
}

function fillRequiredFightFields() {
  enterNewEntity("Robô do lado vermelho", "Novo A");
  enterNewEntity("Equipe do lado vermelho", "Time A");
  enterNewEntity("Robô do lado verde", "Novo B");
  enterNewEntity("Equipe do lado verde", "Time B");
  enterNewEntity("Competição", "Copa Robótica");
  chooseFightCategory();
  fireEvent.change(document.querySelector('.new-fight-form input[type="number"][min="1"]'), {
    target: { value: "30" },
  });
}

function chooseFightCategory(label = "Antweight · 454 g") {
  fireEvent.click(screen.getByRole("button", { name: "Categoria" }));
  fireEvent.click(screen.getByRole("option", { name: label }));
}

function changeHistoryFilter(label, value) {
  const trigger = screen.getByRole("button", { name: label });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  fireEvent.change(screen.getByRole("searchbox", { name: `Buscar ${label.toLocaleLowerCase()}` }), {
    target: { value },
  });
}

beforeEach(() => {
  localStorage.clear();
  mockApi();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("HitTrack dashboard", () => {
  it("shows aggregated fight history on the home page", async () => {
    render(<App />);

    expect(await screen.findByText("02:30")).toBeInTheDocument();
    expect(screen.getByText("hits analisados")).toBeInTheDocument();
    expect(screen.getByText("robôs comparados")).toBeInTheDocument();
    expect(screen.getByText("lutas no histórico")).toBeInTheDocument();
  });

  it("shows previous fights for both robots in the analysis view", async () => {
    const calls = [];
    mockApi((path, options) => {
      calls.push(path);
      if (path === "http://127.0.0.1:8000/api/fights") {
        return jsonResponse([
          ...fights,
          {
            ...fights[0],
            id: 3,
            competition: "Copa Passada",
            robot_green: "Robo Gamma",
            winner_robot: "Robo Alfa",
            fought_at: "2026-02-15T00:00:00",
          },
          {
            ...fights[0],
            id: 4,
            competition: "Torneio sem resultado",
            winner_robot: null,
            fought_at: "2026-01-15T00:00:00",
          },
          {
            ...fights[0],
            id: 5,
            robot_red: "Robo Beta",
            robot_green: "Robo Delta",
            winner_robot: "Robo Delta",
            fought_at: "2025-12-15T00:00:00",
          },
        ]);
      }
      if (path === "http://127.0.0.1:8000/api/fights/3") {
        return jsonResponse({
          ...fight,
          ...fights[0],
          id: 3,
          robot_green: "Robo Gamma",
          winner_robot: "Robo Alfa",
        });
      }
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Análise");

    expect(await screen.findByRole("region", { name: "Histórico dos robôs" })).toBeInTheDocument();
    expect(screen.getByText("Robo Alfa venceu Robo Gamma").closest(".robot-history-match")).toHaveClass("robot-history-match--win");
    expect(screen.getByText("Robo Delta venceu Robo Beta").closest(".robot-history-match")).toHaveClass("robot-history-match--loss");
    expect(screen.getByText("Robo Alfa vs Robo Beta · Sem resultado").closest(".robot-history-match")).toHaveClass("robot-history-match--unknown");
    expect(screen.getByText("Copa Passada · 15/02/2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Robo Alfa venceu Robo Gamma/ }));
    await waitFor(() => expect(calls).toContain("http://127.0.0.1:8000/api/fights/3"));
    expect(await screen.findAllByText("Robo Alfa venceu Robo Gamma")).toHaveLength(2);
  });

  it("filters fight history by searchable robot, team, and competition", async () => {
    render(<App />);
    clickTab("Histórico");

    expect(await screen.findByText("2 de 2 lutas")).toBeInTheDocument();
    changeHistoryFilter("Robô", "Gamma");
    expect(screen.getByText("1 de 2 lutas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Robo Gamma/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Robo Alfa/ })).not.toBeInTheDocument();

    changeHistoryFilter("Equipe", "Equipe Delta");
    expect(screen.getByRole("button", { name: /Robo Gamma/ })).toBeInTheDocument();
    changeHistoryFilter("Robô", "Alfa");
    expect(screen.getByText("0 de 2 lutas")).toBeInTheDocument();

    changeHistoryFilter("Robô", "");
    changeHistoryFilter("Equipe", "");
    changeHistoryFilter("Competição", "Nacional");
    expect(screen.getByText("1 de 2 lutas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Robo Gamma/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Robo Alfa/ })).not.toBeInTheDocument();
  });

  it("paginates fight history and resets to the first page when filtered", async () => {
    const manyFights = Array.from({ length: 12 }, (_, index) => ({
      ...fights[0],
      id: index + 1,
      robot_red: `Robo ${index + 1}`,
      robot_green: `Oponente ${index + 1}`,
    }));
    mockApi((path, options) => {
      if (path === "http://127.0.0.1:8000/api/fights") return jsonResponse(manyFights);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Histórico");

    expect(await screen.findByRole("navigation", { name: "Paginação do histórico" })).toBeInTheDocument();
    expect(document.querySelectorAll(".history-entry")).toHaveLength(10);
    expect(screen.getByText("#01")).toBeInTheDocument();
    expect(screen.getByText("#10")).toBeInTheDocument();
    expect(screen.queryByText("#11")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Próxima página do histórico" }));
    expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
    expect(document.querySelectorAll(".history-entry")).toHaveLength(2);
    expect(screen.getByText("#11")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();

    changeHistoryFilter("Robô", "Robo 12");
    expect(screen.getByRole("button", { name: /Robo 12/ })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Paginação do histórico" })).not.toBeInTheDocument();
    expect(screen.getByText("1 de 12 lutas")).toBeInTheDocument();
  });

  it("shows a hit-based winner in the fight history", async () => {
    render(<App />);
    clickTab("Histórico");

    expect(await screen.findByText("Robo Alfa venceu por hits")).toBeInTheDocument();
  });

  it("shows aggregate analytics, the team profile, and all extended insights", async () => {
    mockApi((path, options) => {
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(analytics);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");

    expect(await screen.findByRole("heading", { name: "Dispersão ELO × hits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hits por luta e robô" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resumo e eficácia" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hits ao longo da luta" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tendência por robô" })).toBeInTheDocument();
    expect(screen.queryByText("Margem de desempenho")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Por categoria" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Por competição" })).toBeInTheDocument();
    expect(screen.queryByText("Taxa de vitórias")).not.toBeInTheDocument();
    expect(screen.queryByText(/considera somente resultados registrados/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobertura dos dados" })).toBeInTheDocument();
    expect(screen.getByText("Equipe A")).toBeInTheDocument();
    expect(screen.getAllByTestId("elo-scatter-point")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Histograma de hits por robô e luta" })).toBeInTheDocument();
    const rhythmChart = screen.getByRole("img", { name: "Média de hits por intervalo da luta" });
    expect(rhythmChart).toBeInTheDocument();
    expect(rhythmChart.querySelectorAll("circle")).toHaveLength(20);
    expect(screen.getByText(/3 hits distribuídos em 1 luta/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Evolução de hits por robô ao longo das lutas" })).toBeInTheDocument();
    expect(screen.getByText("Com eventos de hits")).toBeInTheDocument();
    expect(screen.getByText("Com ELO dos dois robôs")).toBeInTheDocument();
    expect(screen.getAllByText("1/3 pares")).toHaveLength(4);
    expect(screen.getAllByText("1/2 lutas")).toHaveLength(3);

    const tooltipDescriptions = [
      ["Sobre Correlação", "Cada ponto representa um robô em uma luta"],
      ["Sobre Distribuição", "Quantidade de participações de robôs em lutas"],
      ["Sobre Hits da equipe", "Total de hits registrados pelos robôs da equipe"],
      ["Sobre Hits por minuto", "Total de hits dividido pela duração total"],
      ["Sobre Desvio padrão da equipe", "Indica quanto o total de hits da equipe varia entre as lutas"],
      ["Sobre Desvio padrão do robô", "Indica quanto o total de hits do robô varia entre as lutas"],
      ["Sobre Pearson (ELO)", "Mede a relação linear entre o ELO pré-luta e os hits"],
      ["Sobre Spearman (ELO)", "Mede se ELO e hits tendem a aumentar ou diminuir juntos"],
    ];
    for (const [label, description] of tooltipDescriptions) {
      const button = screen.getByRole("button", { name: label });
      expect(document.getElementById(button.getAttribute("aria-describedby"))).toHaveTextContent(description);
    }

    const hitsPerMinuteButton = screen.getByRole("button", { name: "Sobre Hits por minuto" });
    fireEvent.mouseEnter(hitsPerMinuteButton);
    const hitsPerMinuteTooltip = document.getElementById(hitsPerMinuteButton.getAttribute("aria-describedby"));
    expect(hitsPerMinuteTooltip).toHaveClass("tooltip-hint__content--floating", "is-visible");
    expect(hitsPerMinuteTooltip.style.left).not.toBe("");
    expect(hitsPerMinuteTooltip.style.top).not.toBe("");
    fireEvent.mouseLeave(hitsPerMinuteButton);
    fireEvent.mouseEnter(hitsPerMinuteTooltip);
    expect(hitsPerMinuteTooltip).toHaveClass("is-visible");
  });

  it("can include test fights in performance analytics", async () => {
    const calls = [];
    mockApi((path, options) => {
      calls.push(path);
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(analytics);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Incluir lutas de teste" }));

    await waitFor(() => expect(calls).toContain(
      "http://127.0.0.1:8000/api/analytics?include_test_data=true",
    ));
  });

  it("offers robots and teams from test fights in performance filters", async () => {
    const calls = [];
    const testFight = {
      ...fights[0],
      id: 3,
      is_test: true,
      robot_red: "Robo de Teste",
      team_red: "Equipe de Teste",
    };
    mockApi((path, options) => {
      calls.push(path);
      if (path === "http://127.0.0.1:8000/api/fights") return jsonResponse([...fights, testFight]);
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(analytics);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Incluir lutas de teste" }));

    fireEvent.click(screen.getByRole("button", { name: "Robô" }));
    fireEvent.click(await screen.findByRole("option", { name: "Robo de Teste" }));
    fireEvent.click(screen.getByRole("button", { name: "Equipe" }));
    fireEvent.click(await screen.findByRole("option", { name: "Equipe de Teste" }));

    await waitFor(() => expect(calls).toContain(
      "http://127.0.0.1:8000/api/analytics?robot=Robo+de+Teste&team=Equipe+de+Teste&include_test_data=true",
    ));
  });

  it("loads and manually refreshes a RoboCore ranking by category", async () => {
    const calls = [];
    const ranking = {
      category: "antweight",
      source_url: "https://rank.robocore.net/antweight",
      imported_at: "2026-11-04T12:00:00",
      entries: [{
        rank_position: 1,
        elo_score: 1450.25,
        robot_name: "Robo Alpha",
        team_name: "Team Alpha",
        robot_source_id: 123,
        total_fights: 20,
        wins: 14,
        losses: 6,
        latest_fight_at: "2026-10-12T16:56:16",
        robot_url: "https://rank.robocore.net/history/123",
      }],
    };
    mockApi((path, options) => {
      calls.push([path, options]);
      if (path.startsWith("http://127.0.0.1:8000/api/rankings")) return jsonResponse(ranking);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Ranking");

    expect(await screen.findByRole("link", { name: "Robo Alpha" })).toHaveAttribute(
      "href",
      "https://rank.robocore.net/history/123",
    );
    const expectedImportedAt = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date("2026-11-04T12:00:00Z"));
    expect(screen.getByText(`Atualizado em ${expectedImportedAt}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Categoria" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar categoria" }), {
      target: { value: "fairyweight" },
    });
    fireEvent.click(await screen.findByRole("option", { name: "Fairyweight · 150 g" }));
    await waitFor(() => expect(calls.map(([path]) => path)).toContain(
      "http://127.0.0.1:8000/api/rankings?category=fairyweight",
    ));
    fireEvent.click(screen.getByRole("button", { name: "Atualizar ranking" }));
    await waitFor(() => expect(calls.some(([path, options]) => (
      path === "http://127.0.0.1:8000/api/rankings/refresh?category=fairyweight"
      && options.method === "POST"
    ))).toBe(true));
  });

  it("shows ranking tables with shared pagination and sorting", async () => {
    const ranking = {
      category: "antweight",
      source_url: "https://rank.robocore.net/antweight",
      imported_at: "2026-11-04T12:00:00",
      entries: Array.from({ length: 32 }, (_, index) => ({
        rank_position: index + 1,
        elo_score: 1400 - index,
        robot_name: `Robot ${index + 1}`,
        team_name: "Test Team",
        robot_source_id: index + 1,
        total_fights: 10,
        wins: 6,
        losses: 4,
        latest_fight_at: null,
        robot_url: `https://rank.robocore.net/history/${index + 1}`,
      })),
    };
    mockApi((path, options) => {
      if (path.startsWith("http://127.0.0.1:8000/api/rankings")) return jsonResponse(ranking);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Ranking");

    expect(await screen.findByRole("link", { name: "Robot 1" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.queryByRole("link", { name: "Robot 11" })).not.toBeInTheDocument();
    expect(screen.getByText("Robôs 1–10 de 32")).toBeInTheDocument();
    for (const robotField of ["Robô vermelho da simulação", "Robô verde da simulação"]) {
      fireEvent.click(screen.getByRole("button", { name: robotField }));
      fireEvent.change(screen.getByRole("searchbox", { name: `Buscar ${robotField.toLocaleLowerCase()}` }), {
        target: { value: "Robot 32" },
      });
      expect(await screen.findByRole("option", { name: "Robot 32 · ELO 1369.00" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: robotField }));
    }

    fireEvent.click(screen.getByRole("button", { name: "Ir para a última página do ranking" }));
    expect(await screen.findByRole("link", { name: "Robot 32" })).toBeInTheDocument();
    expect(screen.getByText("Robôs 31–32 de 32")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ir para a primeira página do ranking" }));
    expect(await screen.findByRole("link", { name: "Robot 1" })).toBeInTheDocument();
    expect(screen.getByText("Robôs 1–10 de 32")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ordenar por ELO RoboCore" }));
    expect(await screen.findByRole("link", { name: "Robot 32" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /ELO RoboCore/ })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByText("Robôs 1–10 de 32")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Próxima página do ranking" }));
    expect(await screen.findByRole("link", { name: "Robot 22" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Robot 13" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Robot 23" })).not.toBeInTheDocument();
    expect(screen.getByText("Robôs 11–20 de 32")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ir para a última página do ranking" }));
    expect(await screen.findByRole("link", { name: "Robot 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Robot 2" })).toBeInTheDocument();
    expect(screen.getByText("Robôs 31–32 de 32")).toBeInTheDocument();
  });

  it("sorts and paginates analytics tables using the shared controls", async () => {
    const extendedAnalytics = {
      ...analytics,
      robots: Array.from({ length: 12 }, (_, index) => ({
        ...analytics.robots[0],
        robot: `Robot ${index + 1}`,
        fight_count: index + 1,
      })),
    };
    mockApi((path, options) => {
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(extendedAnalytics);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");

    const heading = await screen.findByRole("heading", { name: "Robôs, resultados e ELO" });
    const panel = heading.closest("article");
    const table = within(panel).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(within(table).getByRole("rowheader", { name: "Robot 1" })).toBeInTheDocument();
    expect(screen.getByText("Robôs 1–10 de 12")).toBeInTheDocument();

    fireEvent.click(within(table).getByRole("button", { name: "Ordenar por Lutas" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima página dos robôs" }));
    expect(within(table).getByRole("rowheader", { name: "Robot 11" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "Robot 12" })).toBeInTheDocument();
    expect(screen.getByText("Robôs 11–12 de 12")).toBeInTheDocument();

    fireEvent.click(within(table).getByRole("button", { name: "Ordenar por Lutas" }));
    expect(within(table).getByRole("rowheader", { name: "Robot 12" })).toBeInTheDocument();
    expect(screen.getByText("Robôs 1–10 de 12")).toBeInTheDocument();
  });

  it("labels fictional demo fights in performance analytics", async () => {
    const simulatedAnalytics = {
      ...analytics,
      fights: analytics.fights.map((item) => ({
        ...item,
        status_note: "Dado fictício de demonstração — não corresponde a combate ou resultado oficial.",
      })),
    };
    mockApi((path, options) => {
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(simulatedAnalytics);
      return defaultApiResponse(path, options      );
    });

    render(<App />);
    clickTab("Desempenho");

    expect(await screen.findByRole("note")).toHaveTextContent(
      "robôs, equipes e resultados fictícios",
    );
  });

  it("filters combat rhythm and historical trend by the selected robot", async () => {
    mockApi((path, options) => {
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(analytics);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");

    const rhythmChart = await screen.findByRole("img", { name: "Média de hits por intervalo da luta" });
    const rhythmPanel = screen.getByRole("heading", { name: "Hits ao longo da luta" }).closest("article");
    const trendPanel = screen.getByRole("heading", { name: "Tendência por robô" }).closest("article");
    expect(rhythmChart.querySelectorAll("circle")).toHaveLength(20);

    fireEvent.change(within(rhythmPanel).getByRole("combobox", { name: "Robô do ritmo do combate" }), {
      target: { value: "Robo A" },
    });
    expect(within(rhythmPanel).getByRole("img", { name: "Média de hits por intervalo da luta" }).querySelectorAll("circle")).toHaveLength(10);
    expect(within(rhythmPanel).getByText("Robo A (1 luta)")).toBeInTheDocument();
    expect(within(rhythmPanel).queryByText("Robo B (1 luta)")).not.toBeInTheDocument();

    fireEvent.change(within(trendPanel).getByRole("combobox", { name: "Robô da tendência histórica" }), {
      target: { value: "Robo B" },
    });
    expect(within(trendPanel).getByRole("img", { name: "Evolução de hits por robô ao longo das lutas" }).querySelectorAll("circle")).toHaveLength(1);
    const trendLegend = trendPanel.querySelector(".analytics-chart-legend");
    expect(within(trendLegend).getByText("Robo B")).toBeInTheDocument();
    expect(within(trendLegend).queryByText("Robo A")).not.toBeInTheDocument();
  });

  it("simulates Elo changes from selected ranked robots without creating a fight", async () => {
    const calls = [];
    const ranking = {
      category: "antweight",
      source_url: "https://rank.robocore.net/antweight",
      imported_at: "2026-11-04T12:00:00",
      entries: [
        { rank_position: 1, elo_score: 1010, robot_name: "Robo Beta", team_name: "Team Beta", robot_source_id: 1 },
        { rank_position: 2, elo_score: 1005, robot_name: "Robo Gamma", team_name: "Team Gamma", robot_source_id: 2 },
        { rank_position: 3, elo_score: 1000, robot_name: "Robo Alpha", team_name: "Team Alpha", robot_source_id: 3 },
      ],
    };
    mockApi((path, options) => {
      calls.push([path, options]);
      if (path.startsWith("http://127.0.0.1:8000/api/rankings")) return jsonResponse(ranking);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Ranking");

    fireEvent.click(await screen.findByRole("button", { name: "Robô vermelho da simulação" }));
    fireEvent.click(await screen.findByRole("option", { name: "Robo Alpha · ELO 1000.00" }));
    fireEvent.click(screen.getByRole("button", { name: "Robô verde da simulação" }));
    fireEvent.click(await screen.findByRole("option", { name: "Robo Beta · ELO 1010.00" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Vencedor hipotético" }), {
      target: { value: "Robo Alpha" },
    });

    expect(await screen.findByText("Variação estimada de ELO")).toBeInTheDocument();
    expect(screen.getByLabelText("Variação de ELO de Robo Alpha")).toHaveTextContent("+17.84 pontos");
    expect(screen.getByLabelText("Variação de ELO de Robo Beta")).toHaveTextContent("-17.84 pontos");
    expect(screen.getByLabelText("Variação de ELO de Robo Alpha")).toHaveTextContent("Subiu 2 posições");
    expect(calls.some(([path, options]) => path === "http://127.0.0.1:8000/api/fights" && options?.method === "POST")).toBe(false);
  });

  it("requests aggregate analytics when date and category filters change", async () => {
    const calls = [];
    mockApi((path, options) => {
      calls.push([path, options]);
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(analytics);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");
    await screen.findByRole("heading", { name: "Dispersão ELO × hits" });

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-05-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Categoria" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar categoria" }), { target: { value: "454" } });
    fireEvent.click(await screen.findByRole("option", { name: "Antweight · 454 g" }));
    expect(screen.getByRole("button", { name: "Categoria" })).toHaveTextContent("Antweight · 454 g");
    fireEvent.click(screen.getByRole("button", { name: "Competição" }));
    fireEvent.click(await screen.findByRole("option", { name: "Desafio Nacional" }));
    fireEvent.click(screen.getByRole("button", { name: "Robô" }));
    fireEvent.click(await screen.findByRole("option", { name: "Robo Alfa" }));
    fireEvent.click(screen.getByRole("button", { name: "Equipe" }));
    fireEvent.click(await screen.findByRole("option", { name: "Equipe Alfa" }));

    await waitFor(() => {
      expect(calls.map(([path]) => path)).toContain(
        "http://127.0.0.1:8000/api/analytics?start_date=2026-05-01&end_date=2026-05-31&category=antweight&competition=Desafio+Nacional&robot=Robo+Alfa&team=Equipe+Alfa",
      );
    });
  });

  it("clears all analytics filters and reloads the full history", async () => {
    const calls = [];
    mockApi((path, options) => {
      calls.push(path);
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(analytics);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");
    await screen.findByRole("heading", { name: "Dispersão ELO × hits" });

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-05-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Categoria" }));
    fireEvent.click(await screen.findByRole("option", { name: "Antweight · 454 g" }));
    fireEvent.click(screen.getByRole("button", { name: "Competição" }));
    fireEvent.click(await screen.findByRole("option", { name: "Desafio Nacional" }));
    fireEvent.click(screen.getByRole("button", { name: "Robô" }));
    fireEvent.click(await screen.findByRole("option", { name: "Robo Alfa" }));
    fireEvent.click(screen.getByRole("button", { name: "Equipe" }));
    fireEvent.click(await screen.findByRole("option", { name: "Equipe Alfa" }));
    await waitFor(() => expect(calls).toContain(
      "http://127.0.0.1:8000/api/analytics?start_date=2026-05-01&end_date=2026-05-31&category=antweight&competition=Desafio+Nacional&robot=Robo+Alfa&team=Equipe+Alfa",
    ));

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Desde")).toHaveValue("");
      expect(screen.getByLabelText("Até")).toHaveValue("");
      expect(screen.getByRole("button", { name: "Categoria" })).toHaveTextContent("Selecione categorias...");
      expect(screen.getByRole("button", { name: "Competição" })).toHaveTextContent("Selecione competições...");
      expect(screen.getByRole("button", { name: "Robô" })).toHaveTextContent("Selecione robôs...");
      expect(screen.getByRole("button", { name: "Equipe" })).toHaveTextContent("Selecione equipes...");
      expect(calls).toContain("http://127.0.0.1:8000/api/analytics");
    });
  });

  it("uses localized native date pickers and applies the selected date", async () => {
    const calls = [];
    mockApi((path, options) => {
      calls.push(path);
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(analytics);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");
    await screen.findByRole("heading", { name: "Dispersão ELO × hits" });

    const startDate = screen.getByLabelText("Desde");
    expect(startDate).toHaveAttribute("type", "date");
    expect(startDate).toHaveAttribute("lang", "pt-BR");
    fireEvent.change(startDate, { target: { value: "2026-05-01" } });
    expect(startDate).toHaveValue("2026-05-01");
    await waitFor(() => expect(calls).toContain(
      "http://127.0.0.1:8000/api/analytics?start_date=2026-05-01",
    ));
  });

  it("shows the empty state when analytics has no matching fights", async () => {
    mockApi((path, options) => {
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) {
        return jsonResponse({ ...analytics, fight_count: 0, robots: [], teams: [], fights: [] });
      }
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");

    expect(await screen.findByText("Nenhuma luta corresponde aos filtros selecionados.")).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("elo-scatter-point")).not.toBeInTheDocument();
  });

  it("shows an explicit analytics error when the endpoint fails", async () => {
    mockApi((path, options) => {
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse({}, 503);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as métricas agregadas.",
    );
  });

  it("renders fight metrics in the analysis view", async () => {
    render(<App />);
    clickTab("Análise");

    expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
    expect(screen.getByText("Hits registrados")).toBeInTheDocument();
    expect(screen.getByText("Eficiência por robô")).toBeInTheDocument();
    expect(screen.getByText("Onde os hits aconteceram")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cadência por intervalo" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cadência de hits por robô em dez intervalos da luta" })).toBeInTheDocument();
    expect(screen.getByText("2.5/min · 71.4% dos hits")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ELO antes da luta" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sugestões para a próxima luta" })).toBeInTheDocument();
    expect(screen.getByText(/Poderia ter mantido uma pressão ofensiva maior no segundo terço/)).toBeInTheDocument();
    expect(screen.getByText(/Robo Alfa registrou 2 hits no segundo terço/)).toBeInTheDocument();
    expect(screen.getByText(/não confirmam ataques recebidos nem falhas de defesa/)).toBeInTheDocument();
  });

  it("explains when a closed fight has no hit data for recommendations", async () => {
    mockApi((path, options) => {
      if (path === "http://127.0.0.1:8000/api/fights/1/metrics") {
        return jsonResponse({
          ...metrics,
          total_hits: 0,
          robots: metrics.robots.map((robot) => ({
            ...robot,
            hits: 0,
            third_distribution: [0, 0, 0],
          })),
        });
      }
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Análise");

    expect(await screen.findByText("Esta luta não registrou hits; não há dados para sugerir melhorias.")).toBeInTheDocument();
  });

  it("does not show post-fight suggestions while the fight is ongoing", async () => {
    mockApi((path, options) => {
      if (path === "http://127.0.0.1:8000/api/fights/1") {
        return jsonResponse({ ...fight, status: "em_andamento" });
      }
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Análise");

    expect(await screen.findByText("Onde os hits aconteceram")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sugestões para a próxima luta" })).not.toBeInTheDocument();
  });

  it("saves pre-fight ELO for an existing fight", async () => {
    mockApi((path, options = {}) => {
      if (path === "http://127.0.0.1:8000/api/fights/1/elo" && options.method === "PATCH") {
        return jsonResponse({ ...fight, elo_red: 1200, elo_green: 1100 });
      }
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Análise");
    await screen.findByRole("heading", { name: "ELO antes da luta" });

    fireEvent.change(screen.getByLabelText("ELO pré-luta Robo Alfa"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("ELO pré-luta Robo Beta"), { target: { value: "1100" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar ELO" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/fights/1/elo",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ elo_red: 1200, elo_green: 1100 }),
        }),
      );
    });
  });

  it("shows a video player for a fight with an uploaded video in history", async () => {
    mockApi((path) => {
      if (path === "http://127.0.0.1:8000/api/fights") {
        return jsonResponse([{ ...fights[0], video_filename: "final.mp4" }]);
      }
      return defaultApiResponse(path);
    });
    render(<App />);
    clickTab("Histórico");

    fireEvent.click(await screen.findByText("Assistir vídeo: final.mp4"));

    expect(screen.getByLabelText("Vídeo da luta 1")).toHaveAttribute(
      "src",
      "http://127.0.0.1:8000/api/fights/1/video",
    );
  });

  it("opens searchable alphabetical robot and team dropdowns", async () => {
    render(<App />);
    clickTab("Nova luta");
    expect(screen.getByRole("heading", { name: "Dados da luta" })).toBeInTheDocument();
    expect(document.querySelector(".new-fight-card__heading .section-kicker")).toHaveTextContent("Nova luta");
    const form = document.querySelector(".new-fight-form--page");
    expect(within(form).getAllByText("*")).toHaveLength(8);
    expect(Array.from(form.children).slice(0, 2).map((field) => field.querySelector("label")?.childNodes[0].textContent.trim())).toEqual([
      "Competição",
      "Categoria",
    ]);
    expect(within(form).getByRole("button", { name: "Robô do lado vermelho" })).toHaveAttribute("aria-required", "true");
    expect(within(form).getByRole("button", { name: "Equipe do lado verde" })).toHaveAttribute("aria-required", "true");
    expect(within(form).getByRole("button", { name: "Categoria" })).toHaveAttribute("aria-required", "true");

    fireEvent.click(screen.getByRole("button", { name: "Categoria" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar categoria" }), { target: { value: "454" } });
    fireEvent.click(screen.getByRole("option", { name: "Antweight · 454 g" }));
    expect(screen.getByRole("button", { name: "Categoria" })).toHaveTextContent("Antweight · 454 g");

    fireEvent.click(screen.getByRole("button", { name: "Robô do lado vermelho" }));
    expect(screen.getByRole("searchbox", { name: "Buscar robô do lado vermelho" })).toBeInTheDocument();
    const robotOptions = within(screen.getByRole("listbox", { name: "Opções de robô do lado vermelho" }));
    await waitFor(() => expect(robotOptions.getAllByRole("option")).toHaveLength(4));
    expect(robotOptions.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Robo Alfa", "Robo Beta", "Robo Delta", "Robo Gamma",
    ]);
    fireEvent.click(robotOptions.getByRole("option", { name: "Robo Alfa" }));
    expect(screen.getByRole("button", { name: "Equipe do lado vermelho" })).toHaveTextContent("Equipe Alfa");
    fireEvent.click(screen.getByRole("button", { name: "Equipe do lado vermelho" }));
    const teamOptions = within(screen.getByRole("listbox", { name: "Opções de equipe do lado vermelho" }));
    expect(teamOptions.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Equipe Alfa", "Equipe Beta", "Equipe Delta", "Equipe Gamma",
    ]);
    fireEvent.click(teamOptions.getByRole("option", { name: "Equipe Gamma" }));
    expect(screen.getByRole("button", { name: "Robô do lado vermelho" })).toHaveTextContent("Selecione robô...");
    fireEvent.click(screen.getByRole("button", { name: "Robô do lado vermelho" }));
    const filteredRobots = within(screen.getByRole("listbox", { name: "Opções de robô do lado vermelho" }));
    await waitFor(() => expect(filteredRobots.getAllByRole("option")).toHaveLength(1));
    expect(filteredRobots.getByRole("option", { name: "Robo Gamma" })).toBeInTheDocument();
    expect(screen.getByLabelText("Vídeo da luta")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sobre o ELO pré-luta" })).toHaveLength(2);
    expect(screen.getAllByRole("tooltip")).toHaveLength(2);
    expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent("ELO oficial atual da RoboCore");
  });

  it("clears every new-fight field and the selected video", () => {
    const { container } = render(<App />);
    clickTab("Nova luta");
    enterNewEntity("Robô do lado vermelho", "Novo A");
    enterNewEntity("Robô do lado verde", "Novo B");
    enterNewEntity("Equipe do lado vermelho", "Time A");
    enterNewEntity("Equipe do lado verde", "Time B");
    chooseFightCategory();
    enterNewEntity("Competição", "Copa Robótica");
    selectFightVideo(new File(["video"], "fight.mp4", { type: "video/mp4" }));

    const numberInputs = container.querySelectorAll('.new-fight-form input[type="number"]');
    fireEvent.change(numberInputs[0], { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "Limpar batalha" }));

    expect(screen.getByRole("button", { name: "Robô do lado vermelho" })).toHaveTextContent("Selecione robô...");
    expect(screen.getByRole("button", { name: "Robô do lado verde" })).toHaveTextContent("Selecione robô...");
    expect(screen.getByRole("button", { name: "Equipe do lado vermelho" })).toHaveTextContent("Selecione equipe...");
    expect(screen.getByRole("button", { name: "Categoria" })).toHaveTextContent("Selecione categoria...");
    expect(screen.getByRole("button", { name: "Competição" })).toHaveTextContent("Selecione competição...");
    expect(screen.queryByLabelText("Duração (s)")).not.toBeInTheDocument();
    expect(screen.queryByText(/Duração detectada:/)).not.toBeInTheDocument();
    expect(numberInputs[0]).toHaveValue(null);
    expect(screen.getByLabelText("Vídeo da luta").files).toHaveLength(0);
    expect(screen.queryByRole("searchbox", { name: "Buscar robô do lado vermelho" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar luta e iniciar análise" })).toBeInTheDocument();
  });

  it("opens the latest fight from the home page", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Ver última análise/ }));

    expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
    expect(localStorage.getItem("hittrack-fight-id")).toBe("1");
  });

  it("opens history when no latest fight is available", async () => {
    mockApi((path) => {
      if (path === "http://127.0.0.1:8000/api/fights") return jsonResponse([]);
      return defaultApiResponse(path);
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Ver última análise/ }));

    expect(await screen.findByText("Lutas anteriores")).toBeInTheDocument();
    expect(screen.getByText("0 de 0 lutas")).toBeInTheDocument();
  });

  it("opens a selected fight from history and remembers its id", async () => {
    render(<App />);
    clickTab("Histórico");
    fireEvent.click(await screen.findByRole("button", { name: /Robo Gamma/ }));

    expect(await screen.findByText("Leitura de combate")).toBeInTheDocument();
    expect(localStorage.getItem("hittrack-fight-id")).toBe("2");
  });

  it("ignores history entries with invalid fight ids", async () => {
    mockApi((path, options) => {
      if (path === "http://127.0.0.1:8000/api/fights") {
        return jsonResponse([{ ...fights[0], id: "<script>alert(1)</script>" }, fights[1]]);
      }
      return defaultApiResponse(path, options);
    });

    render(<App />);
    clickTab("Histórico");

    expect(await screen.findByText("1 de 1 lutas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Robo Alfa/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Robo Gamma/ })).toBeInTheDocument();
  });

  it("falls back to the default fight when stored id is invalid", async () => {
    localStorage.setItem("hittrack-fight-id", "1e309");
    const requestedPaths = [];
    mockApi((path, options) => {
      requestedPaths.push(path);
      return defaultApiResponse(path, options);
    });

    render(<App />);

    expect(await screen.findByText("hits analisados")).toBeInTheDocument();
    expect(requestedPaths).toContain("http://127.0.0.1:8000/api/fights/1");
    await waitFor(() => expect(localStorage.getItem("hittrack-fight-id")).toBe("1"));
  });

  it("clears the stored fight id when the selected fight no longer exists", async () => {
    localStorage.setItem("hittrack-fight-id", "1");
    mockApi((path) => {
      if (path === "http://127.0.0.1:8000/api/fights/1") return jsonResponse({}, 404);
      return defaultApiResponse(path);
    });

    render(<App />);

    await waitFor(() => expect(localStorage.getItem("hittrack-fight-id")).toBeNull());
    clickTab("Análise");
    expect(await screen.findByText("Nenhum robô lidera a ofensiva")).toBeInTheDocument();
  });

  it("shows the offline notice when the API returns errors", async () => {
    mockApi(() => jsonResponse({}, 503));

    render(<App />);

    await waitFor(() => expect(document.querySelector(".topbar-status")).toHaveTextContent("API offline"));
    expect(document.querySelector(".content-wrap > .notice")).toHaveTextContent("API offline");
    expect(document.querySelector(".topbar-status")).not.toHaveTextContent("API conectada");
  });

  it("starts analysis again from the overview", async () => {
    const fetchMock = vi.fn((path, options) => {
      if (path === "http://127.0.0.1:8000/api/fights/1/analyze") {
        return Promise.resolve(jsonResponse({ analysis_started: true, fight_id: 1 }, 200));
      }
      return Promise.resolve(defaultApiResponse(String(path), options));
    });
    mockApi((path, options) => fetchMock(path, options));
    render(<App />);
    clickTab("Análise");
    fireEvent.click(await screen.findByRole("button", { name: "Reprocessar análise" }));

    expect(await screen.findByText(/A análise não está em execução/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/fights/1/analyze",
      { method: "POST" },
    );
  });

  it("shows an offline notice when analysis cannot be restarted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockApi((path) => {
      if (path === "http://127.0.0.1:8000/api/fights/1/analyze") return jsonResponse({}, 503);
      return defaultApiResponse(path);
    });
    render(<App />);
    clickTab("Análise");
    expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reprocessar análise" }));

    await waitFor(() => expect(document.querySelector(".topbar-status")).toHaveTextContent("API offline"));
    expect(document.querySelector(".content-wrap > .notice")).toHaveTextContent("API offline");
  });

  it("creates a fight, uploads its video, and starts analysis", async () => {
    const calls = [];
    let createdFight;
    mockApi((path, options = {}) => {
      calls.push([path, options]);
      if (path === "http://127.0.0.1:8000/api/fights" && options.method !== "POST") {
        return jsonResponse(createdFight ? [createdFight, ...fights] : fights);
      }
      if (path === "http://127.0.0.1:8000/api/fights" && options.method === "POST") {
        createdFight = {
          ...fight,
          id: 3,
          competition: "Copa Robótica",
          robot_red: "Novo A",
          robot_green: "Novo B",
          team_red: "Time A",
          team_green: "Time B",
        };
        return jsonResponse({ ...fight, id: 3 });
      }
      if (path === "http://127.0.0.1:8000/api/fights/3/video") return jsonResponse({ ...fight, id: 3 });
      if (path === "http://127.0.0.1:8000/api/fights/3/analyze") {
        return jsonResponse({ analysis_started: true, fight_id: 3 });
      }
      return defaultApiResponse(path, options);
    });
    const { container } = render(<App />);
    clickTab("Análise");
    expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
    clickTab("Nova luta");
    fillRequiredFightFields();
    selectFightVideo(new File(["video"], "fight.mp4", { type: "video/mp4" }));
    expect(screen.getByLabelText("Vídeo da luta").files[0].name).toBe("fight.mp4");
    expect(screen.getByText("Duração detectada: 61.5 s.")).toBeInTheDocument();
    fireEvent.submit(container.querySelector(".new-fight-form"));

    await waitFor(() =>
      expect(calls.some(([path, options]) => path.endsWith("/analyze") && options.method === "POST")).toBe(true),
    );
    await waitFor(() => expect(calls.filter(([path]) => path === "http://127.0.0.1:8000/api/fights").length).toBeGreaterThan(1));
    expect(localStorage.getItem("hittrack-fight-id")).toBe("3");
    clickTab("Histórico");
    expect(await screen.findByText("Copa Robótica")).toBeInTheDocument();
    expect(calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        "http://127.0.0.1:8000/api/fights/3/video",
        "http://127.0.0.1:8000/api/fights/3/analyze",
      ]),
    );
    const createCall = calls.find(([path, options]) => path.endsWith("/api/fights") && options.method === "POST");
    expect(JSON.parse(createCall[1].body)).toMatchObject({
      robot_red: "Novo A",
      robot_green: "Novo B",
      team_red: "Time A",
      team_green: "Time B",
      competition: "Copa Robótica",
      duration_seconds: 61.5,
      elo_red: null,
      elo_green: null,
      robot_aliases: { vermelho: "Novo A", azul: "Novo B" },
    });
    expect(calls.find(([path]) => path.endsWith("/video"))[1].body).toBeInstanceOf(FormData);
  });

  it("offers category-ranked robots and fills their official ELO and team", async () => {
    const ranking = {
      entries: [
        { robot_name: "Robo Alpha", team_name: "Team Alpha", elo_score: 1450.25 },
        { robot_name: "Robo Beta", team_name: "Team Beta", elo_score: 1320.75 },
      ],
    };
    mockApi((path, options) => {
      if (path === "http://127.0.0.1:8000/api/rankings?category=antweight") {
        return jsonResponse(ranking);
      }
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Nova luta");
    chooseFightCategory();

    fireEvent.click(screen.getByRole("button", { name: "Robô do lado vermelho" }));
    fireEvent.click(await screen.findByRole("option", { name: "Robo Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Robô do lado verde" }));
    fireEvent.click(await screen.findByRole("option", { name: "Robo Beta" }));

    expect(screen.getByRole("button", { name: "Equipe do lado vermelho" })).toHaveTextContent("Team Alpha");
    expect(screen.getByRole("button", { name: "Equipe do lado verde" })).toHaveTextContent("Team Beta");
    const eloInputs = document.querySelectorAll(".new-fight-form input[type='number'][step='any']");
    expect(eloInputs[0]).toHaveValue(1450.25);
    expect(eloInputs[1]).toHaveValue(1320.75);
  });

  it("blocks fight creation when the API health check is offline", async () => {
    const calls = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockApi((path, options = {}) => {
      calls.push([path, options]);
      if (path === "http://127.0.0.1:8000/") return jsonResponse({}, 503);
      return defaultApiResponse(path, options);
    });
    const { container } = render(<App />);
    clickTab("Análise");
    expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
    clickTab("Nova luta");
    fillRequiredFightFields();
    selectFightVideo(new File(["video"], "fight.mp4", { type: "video/mp4" }));
    fireEvent.submit(container.querySelector(".new-fight-form"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível criar a luta: a API está offline. Verifique a conexão e tente novamente.",
    );
    expect(screen.getByRole("button", { name: "Criar luta e iniciar análise" })).toBeEnabled();
    expect(calls.some(([path, options]) => path === "http://127.0.0.1:8000/api/fights" && options.method === "POST")).toBe(false);
  });

  it("reports a fight creation failure and does not continue the upload", async () => {
    const calls = [];
    mockApi((path, options = {}) => {
      calls.push([path, options]);
      if (path === "http://127.0.0.1:8000/api/fights" && options.method === "POST") {
        return jsonResponse({ detail: "invalid" }, 422);
      }
      return defaultApiResponse(path, options);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<App />);
    clickTab("Análise");
    expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
    clickTab("Nova luta");
    fillRequiredFightFields();
    selectFightVideo(new File(["video"], "fight.mp4", { type: "video/mp4" }));
    fireEvent.submit(container.querySelector(".new-fight-form"));

    await waitFor(() =>
      expect(calls.some(([path, options]) => path.endsWith("/api/fights") && options.method === "POST")).toBe(true),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível criar a luta");
    expect(calls.map(([path]) => path)).not.toContain(
      "http://127.0.0.1:8000/api/fights/undefined/video",
    );
  });

  it.each(["upload", "analysis"])(
    "stops fight creation when video %s fails",
    async (failedStep) => {
      const calls = [];
      vi.spyOn(console, "error").mockImplementation(() => {});
      mockApi((path, options = {}) => {
        calls.push([path, options]);
        if (path === "http://127.0.0.1:8000/api/fights" && options.method === "POST") {
          return jsonResponse({ ...fight, id: 3 });
        }
        if (path === "http://127.0.0.1:8000/api/fights/3/video") {
          return jsonResponse({}, failedStep === "upload" ? 503 : 200);
        }
        if (path === "http://127.0.0.1:8000/api/fights/3/analyze") {
          return jsonResponse({}, 503);
        }
        return defaultApiResponse(path, options);
      });
      const { container } = render(<App />);
      clickTab("Análise");
      expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
      clickTab("Nova luta");
      fillRequiredFightFields();
      selectFightVideo(new File(["video"], "fight.mp4", { type: "video/mp4" }));
      fireEvent.submit(container.querySelector(".new-fight-form"));

      await waitFor(() =>
        expect(calls.some(([path, options]) => path.endsWith("/video") && options.method === "POST")).toBe(
          true,
        ),
      );
      expect(calls.some(([path]) => path.endsWith("/analyze"))).toBe(failedStep === "analysis");
      expect(localStorage.getItem("hittrack-fight-id")).toBe("1");
    },
  );

  it("does not submit a new fight when no video is selected", async () => {
    const fetchMock = vi.mocked(fetch);
    const { container } = render(<App />);
    clickTab("Nova luta");
    fillRequiredFightFields();
    const callsBeforeSubmit = fetchMock.mock.calls.length;
    fireEvent.submit(container.querySelector(".new-fight-form"));

    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeSubmit);
  });

  it("requires competition and both teams before creating a fight", async () => {
    const fetchMock = vi.mocked(fetch);
    const { container } = render(<App />);
    clickTab("Nova luta");
    fireEvent.submit(container.querySelector(".new-fight-form"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preencha todos os campos obrigatórios: competição, categoria, robôs, equipes, vídeo e FPS.",
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/fights",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("stops an active fight and refreshes its data", async () => {
    const calls = [];
    let stopped = false;
    mockApi((path, options = {}) => {
      calls.push(path);
      if (path === "http://127.0.0.1:8000/api/fights/1") {
        return jsonResponse({
          ...fight,
          status: stopped ? "encerrada" : "em_andamento",
          status_note: stopped ? "Empate em hits (0 a 0); avaliação manual necessária." : null,
        });
      }
      if (path === "http://127.0.0.1:8000/api/fights/1/metrics") {
        return jsonResponse({
          ...metrics,
          total_hits: 0,
          robots: metrics.robots.map((robot) => ({ ...robot, hits: 0, hits_per_minute: 0 })),
        });
      }
      if (path === "http://127.0.0.1:8000/api/fights/1/stop") {
        stopped = true;
        return jsonResponse({
          status: "encerrada",
          status_note: "Empate em hits (0 a 0); avaliação manual necessária.",
          hits_red: 0,
          hits_green: 0,
          frame: 42,
        });
      }
      if (path === "http://127.0.0.1:8000/api/fights/1/result") {
        return jsonResponse({
          ...fight,
          status: "encerrada",
          status_note: "Empate em hits (0 a 0); resultado avaliado manualmente.",
          winner_robot: JSON.parse(options.body).winner_robot,
        });
      }
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Ao vivo");
    expect(await screen.findByText("Robo Alfa")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Encerrar luta" }));

    expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
    expect(screen.getByText("Empate em hits")).toBeInTheDocument();
    expect(screen.getByText("0 a 0 — precisa ser avaliado")).toBeInTheDocument();
    expect(calls).toContain("http://127.0.0.1:8000/api/fights/1/stop");
    expect(calls.filter((path) => path === "http://127.0.0.1:8000/api/fights").length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole("button", { name: "Avaliar: Robo Alfa venceu" }));
    expect(await screen.findByText("Robo Alfa venceu após avaliação (0 a 0)")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/fights/1/result",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ winner_robot: "Robo Alfa" }),
      }),
    );
  });

  it("simulates Elo changes and estimated positions after recording a winner", async () => {
    let winnerRobot = null;
    const ratedFight = {
      ...fight,
      elo_red: 1000,
      elo_green: 1010,
      status: "encerrada",
    };
    const ranking = {
      entries: [
        { robot_name: "Robo Alfa", elo_score: 1000 },
        { robot_name: "Robo Beta", elo_score: 1010 },
        { robot_name: "Robo Gamma", elo_score: 1005 },
      ],
    };
    mockApi((path, options = {}) => {
      if (path === "http://127.0.0.1:8000/api/fights/1") {
        return jsonResponse({ ...ratedFight, winner_robot: winnerRobot });
      }
      if (path === "http://127.0.0.1:8000/api/fights/1/result") {
        winnerRobot = JSON.parse(options.body).winner_robot;
        return jsonResponse({
          ...ratedFight,
          winner_robot: winnerRobot,
          status_note: "Vencedor informado manualmente.",
        });
      }
      if (path === "http://127.0.0.1:8000/api/rankings?category=antweight") {
        return jsonResponse(ranking);
      }
      return defaultApiResponse(path, options);
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Ver última análise/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Avaliar: Robo Alfa venceu" }));

    expect(await screen.findByText("Variação estimada de ELO")).toBeInTheDocument();
    expect(screen.getByLabelText("Variação de ELO de Robo Alfa")).toHaveTextContent("+17.84 pontos");
    expect(screen.getByLabelText("Variação de ELO de Robo Beta")).toHaveTextContent("-17.84 pontos");
    await waitFor(() => expect(screen.getByLabelText("Variação de ELO de Robo Alfa")).toHaveTextContent(
      "Posição estimada: 3º → 1º · Subiu 2 posições",
    ));
    expect(screen.getByLabelText("Variação de ELO de Robo Beta")).toHaveTextContent(
      "Posição estimada: 1º → 3º · Desceu 2 posições",
    );
    expect(screen.getByText(/Não altera o ranking oficial/)).toBeInTheDocument();
  });

  it("shows an offline notice when stopping a fight fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockApi((path, options) => {
      if (path === "http://127.0.0.1:8000/api/fights/1") {
        return jsonResponse({ ...fight, status: "em_andamento" });
      }
      if (path === "http://127.0.0.1:8000/api/fights/1/stop") return jsonResponse({}, 503);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Ao vivo");
    expect(await screen.findByText("Robo Alfa")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Encerrar luta" }));

    await waitFor(() => expect(document.querySelector(".topbar-status")).toHaveTextContent("API offline"));
    expect(document.querySelector(".content-wrap > .notice")).toHaveTextContent("API offline");
  });

  it("displays the video after analysis is complete", async () => {
    vi.useFakeTimers();
    mockApi((path) => {
      if (path === "http://127.0.0.1:8000/api/fights/1") {
        return jsonResponse({ ...fight, video_filename: "fight.mp4" });
      }
      if (path === "http://127.0.0.1:8000/analysis/status") {
        return jsonResponse({ active: false, frame: 42 });
      }
      return defaultApiResponse(path);
    });
    render(<App />);
    clickTab("Análise");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(document.querySelector("video")).toHaveAttribute(
      "src",
      "http://127.0.0.1:8000/api/fights/1/video",
    );
  });

  it("displays a completed fight video when the analysis status has no frame", async () => {
    mockApi((path) => {
      if (path === "http://127.0.0.1:8000/api/fights/1") {
        return jsonResponse({ ...fight, video_filename: "fight.mp4" });
      }
      return defaultApiResponse(path);
    });
    render(<App />);
    clickTab("Análise");

    expect(await screen.findByText("fight.mp4")).toBeInTheDocument();
    expect(document.querySelector(".fight-video")).toHaveAttribute(
      "src",
      "http://127.0.0.1:8000/api/fights/1/video",
    );
  });
});
