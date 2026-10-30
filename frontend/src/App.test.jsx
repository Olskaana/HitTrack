import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.jsx";

const fights = [
  {
    id: 1,
    robot_red: "Robo Alfa",
    robot_green: "Robo Beta",
    team_red: "Equipe Alfa",
    team_green: "Equipe Beta",
    category: "antweight",
    status: "encerrada",
    result: "vitoria",
    total_hits: 7,
    duration_seconds: 120,
  },
  {
    id: 2,
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

beforeEach(() => {
  localStorage.clear();
  mockApi();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  it("filters fight history by robot and team", async () => {
    render(<App />);
    clickTab("Histórico");

    expect(await screen.findByText("2 de 2 lutas")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Buscar por robô"), {
      target: { value: "Gamma" },
    });
    expect(screen.getByText("1 de 2 lutas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Robo Gamma/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Robo Alfa/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Buscar por equipe"), {
      target: { value: "Equipe Delta" },
    });
    expect(screen.getByRole("button", { name: /Robo Gamma/ })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Buscar por robô"), {
      target: { value: "Alfa" },
    });
    expect(screen.getByText("0 de 2 lutas")).toBeInTheDocument();
  });

  it("renders fight metrics in the analysis view", async () => {
    render(<App />);
    clickTab("Análise");

    expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
    expect(screen.getByText("Hits registrados")).toBeInTheDocument();
    expect(screen.getByText("Eficiência por robô")).toBeInTheDocument();
    expect(screen.getByText("Onde os hits aconteceram")).toBeInTheDocument();
  });

  it("opens the new-fight form", () => {
    const { container } = render(<App />);
    fireEvent.click(
      within(container.querySelector(".page-heading")).getByRole("button", { name: "Nova luta" }),
    );

    expect(screen.getByLabelText("Robô vermelho")).toBeInTheDocument();
    expect(screen.getByLabelText("Robô verde")).toBeInTheDocument();
    expect(screen.getByLabelText("Vídeo da luta")).toBeInTheDocument();
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

    expect(await screen.findByText(/API offline/)).toBeInTheDocument();
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

    expect(await screen.findByText(/API offline/)).toBeInTheDocument();
  });

  it("creates a fight, uploads its video, and starts analysis", async () => {
    const calls = [];
    mockApi((path, options = {}) => {
      calls.push([path, options]);
      if (path === "http://127.0.0.1:8000/api/fights" && options.method === "POST") {
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
    fireEvent.click(within(container.querySelector(".page-heading")).getByRole("button", { name: "Nova luta" }));
    fireEvent.change(screen.getByLabelText("Robô vermelho"), { target: { value: "Novo A" } });
    fireEvent.change(screen.getByLabelText("Robô verde"), { target: { value: "Novo B" } });
    fireEvent.change(screen.getByLabelText("Equipe vermelha"), { target: { value: "Time A" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "antweight" } });
    fireEvent.change(screen.getByLabelText("Vídeo da luta"), {
      target: { files: [new File(["video"], "fight.mp4", { type: "video/mp4" })] },
    });
    expect(screen.getByLabelText("Vídeo da luta").files[0].name).toBe("fight.mp4");
    fireEvent.submit(container.querySelector(".new-fight-form"));

    await waitFor(() =>
      expect(calls.some(([path, options]) => path.endsWith("/analyze") && options.method === "POST")).toBe(true),
    );
    expect(localStorage.getItem("hittrack-fight-id")).toBe("3");
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
      robot_aliases: { vermelho: "Novo A", azul: "Novo B" },
    });
    expect(calls.find(([path]) => path.endsWith("/video"))[1].body).toBeInstanceOf(FormData);
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
    fireEvent.click(within(container.querySelector(".page-heading")).getByRole("button", { name: "Nova luta" }));
    fireEvent.change(screen.getByLabelText("Robô vermelho"), { target: { value: "Novo A" } });
    fireEvent.change(screen.getByLabelText("Robô verde"), { target: { value: "Novo B" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "antweight" } });
    fireEvent.change(screen.getByLabelText("Vídeo da luta"), {
      target: { files: [new File(["video"], "fight.mp4", { type: "video/mp4" })] },
    });
    fireEvent.submit(container.querySelector(".new-fight-form"));

    await waitFor(() =>
      expect(calls.some(([path, options]) => path.endsWith("/api/fights") && options.method === "POST")).toBe(true),
    );
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
      fireEvent.click(
        within(container.querySelector(".page-heading")).getByRole("button", { name: "Nova luta" }),
      );
      fireEvent.change(screen.getByLabelText("Robô vermelho"), { target: { value: "Novo A" } });
      fireEvent.change(screen.getByLabelText("Robô verde"), { target: { value: "Novo B" } });
      fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "antweight" } });
      fireEvent.change(screen.getByLabelText("Vídeo da luta"), {
        target: { files: [new File(["video"], "fight.mp4", { type: "video/mp4" })] },
      });
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
    fireEvent.click(within(container.querySelector(".page-heading")).getByRole("button", { name: "Nova luta" }));
    fireEvent.change(screen.getByLabelText("Robô vermelho"), { target: { value: "Novo A" } });
    fireEvent.change(screen.getByLabelText("Robô verde"), { target: { value: "Novo B" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "antweight" } });
    const callsBeforeSubmit = fetchMock.mock.calls.length;
    fireEvent.submit(container.querySelector(".new-fight-form"));

    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeSubmit);
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
          status_note: stopped ? "Finalizada" : null,
        });
      }
      if (path === "http://127.0.0.1:8000/api/fights/1/stop") {
        stopped = true;
        return jsonResponse({ status: "encerrada", status_note: "Finalizada", frame: 42 });
      }
      return defaultApiResponse(path, options);
    });
    render(<App />);
    clickTab("Ao vivo");
    expect(await screen.findByText("Robo Alfa")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Encerrar luta" }));

    expect(await screen.findByText("Robo Alfa lidera a ofensiva")).toBeInTheDocument();
    expect(screen.getByText("Finalizada")).toBeInTheDocument();
    expect(calls).toContain("http://127.0.0.1:8000/api/fights/1/stop");
    expect(calls.filter((path) => path === "http://127.0.0.1:8000/api/fights").length).toBeGreaterThan(1);
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

    expect(await screen.findByText(/API offline/)).toBeInTheDocument();
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
