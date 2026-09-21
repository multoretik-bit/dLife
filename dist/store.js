import { validateState } from "./schedule.js";
export class ScheduleStore {
  revision = 0;
  async load() {
    const r = await fetch("/api/schedule", { cache: "no-store" });
    if (!r.ok)
      throw new Error(
        r.status === 401
          ? "Откройте dLife в своём аккаунте."
          : "Не удалось загрузить расписание. Попробуйте ещё раз.",
      );
    const data = await r.json();
    if (!validateState(data.state))
      throw new Error("Данные расписания повреждены.");
    this.revision = data.revision;
    return data.state;
  }
  async save(state) {
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
