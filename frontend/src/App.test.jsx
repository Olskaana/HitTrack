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
    { robot: "Robo Alfa", hits: 5, hits_per_minute: 2.5, third_distribution: [2, 2, 1] },
    { robot: "Robo Beta", hits: 2, hits_per_minute: 1, third_distribution: [1, 0, 1] },
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

  it("shows a hit-based winner in the fight history", async () => {
    render(<App />);
    clickTab("Histórico");

    expect(await screen.findByText("Robo Alfa venceu por hits")).toBeInTheDocument();
  });

  it("shows aggregate analytics, the team profile, and both charts", async () => {
    mockApi((path, options) => {
      if (path.startsWith("http://127.0.0.1:8000/api/analytics")) return jsonResponse(analytics);
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Desempenho");

    expect(await screen.findByRole("heading", { name: "Dispersão ELO × hits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hits por luta e robô" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resumo e eficácia" })).toBeInTheDocument();
    expect(screen.getByText("Equipe A")).toBeInTheDocument();
    expect(screen.getAllByTestId("elo-scatter-point")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Histograma de hits por robô e luta" })).toBeInTheDocument();
    expect(screen.getAllByText("1/3 pares")).toHaveLength(4);
    expect(screen.getAllByText("1/2 lutas")).toHaveLength(3);
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
    expect(screen.getByRole("heading", { name: "ELO antes da luta" })).toBeInTheDocument();
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
    expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent("Pontuação que representa o nível estimado do robô antes desta luta");
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
      "API offline. Reconecte a API antes de criar uma luta.",
    );
    expect(screen.getByRole("button", { name: "Criar luta e iniciar análise" })).toBeDisabled();
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
});
