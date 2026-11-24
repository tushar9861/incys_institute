"use client";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { X, Plus } from "lucide-react";
import { api } from "@/lib/client";
export function QuizComposer({
  cohorts,
  close,
  done,
}: {
  cohorts: any[];
  close: () => void;
  done: () => void;
}) {
  const [questions, setQuestions] = useState([
      { prompt: "", options: ["", "", "", ""], correctIndex: 0 },
    ]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    d.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = previous;
      trigger?.focus();
    };
  }, []);
  function change(index: number, value: any) {
    setQuestions(
      questions.map((q, i) => (i === index ? { ...q, ...value } : q)),
    );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("quizzes", "POST", {
        cohortId: f.get("cohortId"),
        title: f.get("title"),
        durationMinutes: Number(f.get("duration")),
        passPercent: Number(f.get("pass")),
        maxAttempts: Number(f.get("attempts")),
        published: true,
        questions,
      });
      done();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal-backdrop native-dialog"
      aria-label="Create assessment"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <section className="modal">
        <div className="modal-heading">
          <h2>Create an assessment</h2>
          <button
            className="icon-button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
          >
            <X />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Assessment title
              <input name="title" minLength={3} required />
            </label>
            <label>
              Cohort
              <select name="cohortId" required>
                {cohorts.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Time limit (minutes)
              <input
                type="number"
                name="duration"
                defaultValue={30}
                min={1}
                max={240}
                required
              />
            </label>
            <label>
              Pass score (%)
              <input
                type="number"
                name="pass"
                defaultValue={60}
                min={0}
                max={100}
                required
              />
            </label>
            <label>
              Allowed attempts
              <input
                type="number"
                name="attempts"
                defaultValue={2}
                min={1}
                max={10}
                required
              />
            </label>
          </div>
          {questions.map((q, i) => (
            <fieldset className="lesson" key={i}>
              <legend>Question {i + 1}</legend>
              <label>
                Question
                <input
                  value={q.prompt}
                  onChange={(e) => change(i, { prompt: e.target.value })}
                  required
                  minLength={3}
                />
              </label>
              <div className="form-grid">
                {q.options.map((o, j) => (
                  <label key={j}>
                    Option {j + 1}
                    <input
                      value={o}
                      onChange={(e) =>
                        change(i, {
                          options: q.options.map((x, k) =>
                            k === j ? e.target.value : x,
                          ),
                        })
                      }
                      required
                    />
                  </label>
                ))}
              </div>
              <label>
                Correct answer
                <select
                  value={q.correctIndex}
                  onChange={(e) =>
                    change(i, { correctIndex: Number(e.target.value) })
                  }
                >
                  {q.options.map((_, j) => (
                    <option value={j} key={j}>
                      Option {j + 1}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          ))}
          <button
            type="button"
            className="button secondary small"
            onClick={() =>
              setQuestions([
                ...questions,
                { prompt: "", options: ["", "", "", ""], correctIndex: 0 },
              ])
            }
            disabled={questions.length >= 100}
          >
            <Plus size={16} />
            Add question
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="section-note">
            Published assessments become part of course completion requirements.
            Check every question before publishing.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="button" disabled={busy}>
              {busy ? "Publishing…" : "Publish assessment"}
            </button>
          </div>
        </form>
      </section>
    </dialog>
  );
}
