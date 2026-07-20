import * as dashboardRepository from "./dashboard.repository.js";

export async function getDashboardSummary() {
  return await dashboardRepository.getDashboardSummary();
}
