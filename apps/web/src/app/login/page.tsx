"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiClient.post("/auth/login", { username, password });
      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <Image
        src="/images/ranjirams-hotel-login.jpg"
        alt=""
        fill
        priority
        quality={75}
        sizes="100vw"
        className={styles.background}
      />
      <div className={styles.overlay} aria-hidden="true" />

      <section className={styles.card} aria-labelledby="login-heading">
        <div className={styles.cardHighlight} aria-hidden="true" />

        <header className={styles.header}>
          <p className={styles.eyebrow}>Welcome back</p>
          <h1 id="login-heading" className={styles.title}>
            Ranjirams Hotel
          </h1>
          <p className={styles.subtitle}>Hotel Management Login</p>
        </header>

        {error && (
          <div className={styles.error} role="alert" aria-live="assertive">
            <span className={styles.errorIcon} aria-hidden="true">!</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="username" className={styles.label}>Username</label>
            <input
              id="username"
              name="username"
              type="text"
              placeholder="admin"
              required
              autoComplete="username"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={styles.submit}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );
}
