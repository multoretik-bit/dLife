import { cloudClient, cloudEnabled, cloudUser, codeSyncEnabled } from "./cloud.js";
import { emptyState, validateState } from "./schedule.js";

const LOCAL_KEY = "dlife-local-state-v1";

function loadLocal() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
    return validateState(stored?.state)
      ? stored
      : { state: emptyState(), revision: 0 };
  } catch {
    return { state: emptyState(), revision: 0 };
  }
}

function saveLocal(state, revision) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ state, revision }));
}

export class ScheduleStore {
  revision = 0;
  backend = "api";

  async load() {
    if (codeSyncEnabled()) {
      const user = await cloudUser();
      if (!user) throw Error("Устройство вышло из аккаунта синхронизации. Введи код снова на главной.");
      const { data, error } = await cloudClient().rpc("dlife_code_load");
      if (error) throw Error("Синхронизация по коду недоступна: " + error.message);
      if (!data?.payload || !validateState(data.payload)) throw Error("Облачные данные не прошли проверку.");
      this.backend = "code";
      this.revision = Number(data.revision || 0);
      return data.payload;
    }
    if (cloudEnabled()) {
      const user = await cloudUser();
      if (!user)
        throw Error("Войди в Supabase через «Синхронизация» на главной.");
      const { data, error } = await cloudClient()
        .from("dlife_state")
        .select("payload,revision")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error)
        throw Error(
          "Supabase недоступен. Данные не перезаписываются. " + error.message,
        );
      if (!data)
        throw Error(
          "Данные ещё не перенесены в Supabase. Открой синхронизацию.",
        );
      if (!validateState(data.payload))
        throw Error("Данные Supabase не прошли проверку.");
      this.backend = "supabase";
      this.revision = data.revision;
      return data.payload;
    }

    try {
      const r = await fetch("/api/schedule", { cache: "no-store" });
      if (!r.ok) throw new Error(`api_${r.status}`);
      const data = await r.json();
      if (!validateState(data.state))
        throw new Error("Данные расписания повреждены.");
      this.backend = "api";
      this.revision = data.revision;
      return data.state;
    } catch {
      const local = loadLocal();
      this.backend = "local";
      this.revision = local.revision;
      return local.state;
    }
  }

  async save(state) {
    if (!validateState(state)) throw Error("Проверь введённые значения.");
    if (codeSyncEnabled()) {
      const { data, error } = await cloudClient().rpc("dlife_code_save", { p_payload: state, p_revision: this.revision });
      if (error) throw Error(error.message.includes("revision conflict") ? "Данные изменились на другом устройстве. Обнови страницу." : "Supabase не сохранил изменения: " + error.message);
      this.backend = "code";
      this.revision = Number(data);
      return state;
    }
    if (cloudEnabled()) {
      const { data, error } = await cloudClient().rpc("dlife_save", {
        p_payload: state,
        p_revision: this.revision,
      });
      if (error)
        throw Error(
          error.message.includes("revision conflict")
            ? "Данные изменены на другом устройстве. Обнови страницу."
            : "Supabase не сохранил изменения: " + error.message,
        );
      this.backend = "supabase";
      this.revision = data;
      return state;
    }

    if (this.backend === "local") {
      this.revision += 1;
      saveLocal(state, this.revision);
      return state;
    }

    const r = await fetch("/api/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, revision: this.revision }),
    });
    if (!r.ok)
      throw new Error(
        r.status === 409
          ? "Расписание изменилось на другом устройстве. Закройте настройки и обновите страницу; ваши поля пока сохранены в форме."
          : "Не удалось сохранить. Ваши изменения остались в форме — попробуйте ещё раз.",
      );
    this.revision = (await r.json()).revision;
    return state;
  }
}
