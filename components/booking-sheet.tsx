"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarDays, X, MapPin, Video, Check } from "lucide-react";
import { api, money } from "@/lib/client";
export function BookingSheet({
  catalog,
  close,
  done,
  requestHelp,
}: {
  catalog: any;
  close: () => void;
  done: () => void;
  requestHelp: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [serviceId, setService] = useState(catalog.services[0]?.id || ""),
    [practitionerId, setPractitioner] = useState(""),
    [selected, setSelected] = useState(""),
    [day, setDay] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [blocked, setBlocked] = useState<string[]>([]);
  const service = catalog.services.find((s: any) => s.id === serviceId);
  const practitioners = catalog.practitioners.filter((p: any) =>
    p.service_ids.includes(serviceId),
  );
  const practitioner =
    practitioners.find((p: any) => p.id === practitionerId) || practitioners[0];
  const dayKey = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  const slots = useMemo(() => {
    if (!service || !practitioner) return [];
    const length = Math.max(1, service.duration_minutes) * 60000;
    const result = new Set<string>();
    for (const window of catalog.availability.filter(
      (w: any) => w.practitioner_id === practitioner.id,
    )) {
      const start = Date.parse(window.starts_at),
        end = Date.parse(window.ends_at);
      for (
        let t = start;
        t + length <= end && result.size < 2000;
        t += length
      ) {
        if (t > Date.now()) result.add(new Date(t).toISOString());
      }
    }
    return [...result]
      .sort()
      .filter((t) => !blocked.includes(`${practitioner.id}:${t}`));
  }, [catalog, service, practitioner, blocked]);
  const days = [...new Set(slots.map((s) => dayKey(new Date(s))))];
  const selectedDay = days.includes(day) ? day : days[0];
  const daySlots = slots.filter((s) => dayKey(new Date(s)) === selectedDay);
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
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !daySlots.includes(selected)) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("appointments", "POST", {
        serviceId,
        practitionerId: practitioner.id,
        startsAt: selected,
        mode: f.get("mode"),
        consent: f.get("consent") === "on",
      });
      done();
      close();
    } catch (e) {
      if ((e as any).status === 409) {
        setBlocked((b) => [...b, `${practitioner.id}:${selected}`]);
        setSelected("");
        setError("That time is no longer available. Please choose another.");
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="enquiry-sheet booking-sheet"
      aria-labelledby="booking-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-handle" />
        <button
          aria-label="Close booking"
          className="icon-button sheet-close"
          onClick={close}
          disabled={busy}
        >
          <X />
        </button>
        <span className="icon-tile mint">
          <CalendarDays />
        </span>
        <h2 id="booking-title">Make time for you.</h2>
        <p className="muted">Choose your care and a published time.</p>
        <form onSubmit={submit}>
          <label>
            Service
            <select
              value={serviceId}
              onChange={(e) => {
                setService(e.target.value);
                setSelected("");
                setDay("");
                setError("");
              }}
            >
              {catalog.services.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Practitioner
            <select
              value={practitioner?.id || ""}
              onChange={(e) => {
                setPractitioner(e.target.value);
                setSelected("");
                setDay("");
                setError("");
              }}
            >
              {practitioners.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {days.length ? (
            <>
              <label>
                Date · India time
                <select
                  value={selectedDay}
                  onChange={(e) => {
                    setDay(e.target.value);
                    setSelected("");
                    setError("");
                  }}
                >
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {new Intl.DateTimeFormat("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Kolkata",
                      }).format(
                        new Date(slots.find((s) => dayKey(new Date(s)) === d)!),
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="time-picker">
                <legend>Choose a time · IST</legend>
                <div className="time-grid">
                  {daySlots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={selected === s ? "selected" : ""}
                      aria-pressed={selected === s}
                      onClick={() => setSelected(s)}
                    >
                      {new Intl.DateTimeFormat("en-IN", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata",
                      }).format(new Date(s))}
                      {selected === s && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <div className="booking-empty">
              <p>No published times for this practitioner yet.</p>
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  close();
                  requestHelp();
                }}
              >
                Ask the care team
              </button>
            </div>
          )}
          <fieldset className="visit-picker">
            <legend>Visit type</legend>
            <label>
              <input
                type="radio"
                name="mode"
                value="in_person"
                defaultChecked
              />
              <MapPin size={16} /> At the institute
            </label>
            <label>
              <input type="radio" name="mode" value="online" />
              <Video size={16} /> Online
            </label>
          </fieldset>
          <div className="booking-total">
            <span>{service?.duration_minutes} minutes</span>
            <strong>{money(service?.price_paise || 0)}</strong>
          </div>
          <label className="check">
            <input type="checkbox" name="consent" required />I agree to this
            booking and, if online, a remote consultation.
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button"
            disabled={busy || !selected || !daySlots.includes(selected)}
          >
            {busy ? "Confirming…" : "Confirm booking"}
          </button>
          <small>Payment, if due, is available after booking.</small>
        </form>
      </div>
    </dialog>
  );
}
