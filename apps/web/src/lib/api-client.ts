import { config } from "./config";

export class ApiError extends Error {
  public status: number;
  public data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = "ApiError";
  }
}

async function handleResponse(response: Response) {
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    
    const message = data?.message || response.statusText || "An unexpected error occurred";
    throw new ApiError(response.status, message, data);
  }

  return data;
}

export const apiClient = {
  get: async (endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(`${config.apiUrl}${endpoint}`, {
      ...options,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      credentials: "include",
    });
    return handleResponse(response);
  },

  post: async (endpoint: string, body: unknown, options: RequestInit = {}) => {
    const response = await fetch(`${config.apiUrl}${endpoint}`, {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(body),
      credentials: "include",
    });
    return handleResponse(response);
  },

  patch: async (endpoint: string, body: unknown, options: RequestInit = {}) => {
    const response = await fetch(`${config.apiUrl}${endpoint}`, {
      ...options,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(body),
      credentials: "include",
    });
    return handleResponse(response);
  },

  delete: async (endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(`${config.apiUrl}${endpoint}`, {
      ...options,
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      credentials: "include",
    });
    return handleResponse(response);
  },
};
