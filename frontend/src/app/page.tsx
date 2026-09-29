"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Operation = "add" | "subtract" | "multiply" | "divide";

type Calculation = {
  id: number;
  firstNumber: number;
  secondNumber: number;
  operation: Operation;
  result: number;
};

const operations: { value: Operation; symbol: string; label: string }[] = [
  { value: "add", symbol: "+", label: "Add" },
  { value: "subtract", symbol: "-", label: "Subtract" },
  { value: "multiply", symbol: "x", label: "Multiply" },
  { value: "divide", symbol: "/", label: "Divide" },
];

const operationSymbols: Record<Operation, string> = {
  add: "+",
  subtract: "-",
  multiply: "x",
  divide: "/",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
}

export default function Home() {
  const [firstNumber, setFirstNumber] = useState("18");
  const [secondNumber, setSecondNumber] = useState("6");
  const [operation, setOperation] = useState<Operation>("add");
  const [result, setResult] = useState<number | null>(null);
  const [history, setHistory] = useState<Calculation[]>([]);
  const [error, setError] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);

  async function handleCalculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const first = Number(firstNumber);
    const second = Number(secondNumber);

    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      setError("Enter a valid number in both fields.");
      return;
    }

    setIsCalculating(true);

    try {
      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, firstNumber: first, secondNumber: second }),
      });
      const payload = (await response.json()) as { result?: number; error?: string };

      if (!response.ok || typeof payload.result !== "number") {
        throw new Error(payload.error || "The calculation could not be completed.");
      }

      const calculation = {
        id: Date.now(),
        firstNumber: first,
        secondNumber: second,
        operation,
        result: payload.result,
      };

      setResult(payload.result);
      setHistory((current) => [calculation, ...current].slice(0, 5));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong.");
      setResult(null);
    } finally {
      setIsCalculating(false);
    }
  }

  function resetCalculator() {
    setFirstNumber("");
    setSecondNumber("");
    setOperation("add");
    setResult(null);
    setError("");
  }

  return (
    <main className="app-shell">
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Calculatris home">
          <span className="brand-mark" aria-hidden="true">∑</span>
          <span>calculatris</span>
        </Link>
        <div className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          <span>Calculator API</span>
        </div>
      </header>

      <section className="workspace">
        <div className="intro">
          <p className="eyebrow">A quiet place for loud numbers</p>
          <h1>Make the math<br /><em>make sense.</em></h1>
          <p className="intro-copy">A focused calculator for quick decisions, careful checks, and the little moments when the answer matters.</p>
        </div>

        <div className="calculator-grid">
          <section className="calculator-panel" aria-labelledby="calculator-title">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Workspace / 01</p>
                <h2 id="calculator-title">Build an expression</h2>
              </div>
              <button className="text-button" type="button" onClick={resetCalculator}>Clear</button>
            </div>

            <form onSubmit={handleCalculate}>
              <div className="number-row">
                <label className="number-field">
                  <span>First number</span>
                  <input aria-label="First number" inputMode="decimal" type="number" step="any" value={firstNumber} onChange={(event) => setFirstNumber(event.target.value)} placeholder="0" />
                </label>
                <span className="operator-mark" aria-hidden="true">{operationSymbols[operation]}</span>
                <label className="number-field">
                  <span>Second number</span>
                  <input aria-label="Second number" inputMode="decimal" type="number" step="any" value={secondNumber} onChange={(event) => setSecondNumber(event.target.value)} placeholder="0" />
                </label>
              </div>

              <fieldset className="operation-fieldset">
                <legend>Choose an operation</legend>
                <div className="operation-grid">
                  {operations.map((item) => (
                    <label className={`operation-option ${operation === item.value ? "selected" : ""}`} key={item.value}>
                      <input type="radio" name="operation" value={item.value} checked={operation === item.value} onChange={() => setOperation(item.value)} />
                      <span className="operation-symbol">{item.symbol}</span>
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {error && <p className="error-message" role="alert">{error}</p>}

              <button className="calculate-button" type="submit" disabled={isCalculating}>
                <span>{isCalculating ? "Calculating..." : "Calculate result"}</span>
                <span className="button-arrow" aria-hidden="true">↗</span>
              </button>
            </form>
          </section>

          <aside className="result-panel" aria-live="polite">
            <div className="result-topline">
              <p className="section-kicker">Answer / 02</p>
              <span className="result-badge">{result === null ? "Ready" : "Complete"}</span>
            </div>
            <div className="result-display">
              <span className="result-label">Your result</span>
              <strong>{result === null ? "—" : formatNumber(result)}</strong>
              <span className="result-expression">{formatNumber(Number(firstNumber) || 0)} {operationSymbols[operation]} {formatNumber(Number(secondNumber) || 0)}</span>
            </div>
            <div className="result-footnote">
              <span className="spark" aria-hidden="true">✦</span>
              <span>Precision without the noise.</span>
            </div>
          </aside>
        </div>

        <section className="history-section" aria-labelledby="history-title">
          <div className="history-heading">
            <div>
              <p className="section-kicker">Archive / 03</p>
              <h2 id="history-title">Recent calculations</h2>
            </div>
            <span className="history-count">{history.length.toString().padStart(2, "0")} saved</span>
          </div>
          {history.length === 0 ? (
            <div className="empty-history"><span aria-hidden="true">◌</span><p>Your latest answers will appear here.</p></div>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <div className="history-item" key={item.id}>
                  <span>{formatNumber(item.firstNumber)} {operationSymbols[item.operation]} {formatNumber(item.secondNumber)}</span>
                  <span className="history-equals">=</span>
                  <strong>{formatNumber(item.result)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      <footer className="footer"><span>CALCULATRIS / 2026</span><span>Built for clear thinking</span></footer>
    </main>
  );
}
