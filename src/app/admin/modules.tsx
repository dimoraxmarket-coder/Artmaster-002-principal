"use client";
import { useEffect, useState } from "react";
import type { Actor } from "@/lib/server/types";
import type { StaffMember } from "@/lib/server/workflow-types";
export { MediaLibrary } from "./media-studio";
import { adminApi } from "./api";
import { Action, AdminIcon, EmptyState, Notice, Skeleton } from "./components";
import styles from "./admin.module.css";

export type SessionPolicy = { idleMinutes: number; absoluteHours: number };
export function SecurityCenter({
  actor,
  authMode,
  onLogout,
  sessionPolicy,
}: {
  actor: Actor;
  authMode: "local" | "supabase";
  onLogout: () => void;
  sessionPolicy: SessionPolicy;
}) {
  const verified = actor.aal === "aal2" && authMode === "supabase";
  return (
    <>
      <div className={styles.securityHero}>
        <div className={styles.securityEmblem}>
          <AdminIcon name="shield" />
        </div>
        <div>
          <span className={styles.eyebrow}>ACCES & PROTECȚIE</span>
          <h2>
            {verified
              ? "Identitate confirmată în doi pași."
              : "Autentificare locală de dezvoltare."}
          </h2>
          <p>
            {verified
              ? "Această sesiune a trecut verificarea MFA. Permisiunile se verifică pe server pentru fiecare acțiune."
              : "Acest mediu folosește autentificare locală prin parolă. Nu reprezintă validarea MFA sau a serviciilor de producție."}
          </p>
        </div>
        <span
          className={`${styles.securityTag} ${!verified ? styles.localTag : ""}`}
        >
          {verified ? "MFA confirmată" : "Mediu local"}
        </span>
      </div>
      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Contul tău</h2>
            <AdminIcon name="lock" />
          </div>
          <dl className={styles.securityList}>
            <div>
              <dt>E-mail</dt>
              <dd>{actor.email}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>
                {actor.role === "admin"
                  ? "Administrator"
                  : actor.role === "editor"
                    ? "Editor"
                    : "Vizualizare"}
              </dd>
            </div>
            <div>
              <dt>Autentificare</dt>
              <dd>{verified ? "Parolă + TOTP" : "Parolă locală"}</dd>
            </div>
          </dl>
          <div className={styles.padded}>
            <Action icon="logout" onClick={onLogout}>
              Încheie această sesiune
            </Action>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Politica sesiunii</h2>
            <AdminIcon name="clock" />
          </div>
          <div className={styles.sessionPolicy}>
            <div>
              <strong>
                {sessionPolicy.idleMinutes}
                <span>min</span>
              </strong>
              <p>Limită de inactivitate</p>
            </div>
            <div>
              <strong>
                {sessionPolicy.absoluteHours}
                <span>ore</span>
              </strong>
              <p>Durată maximă absolută</p>
            </div>
          </div>
          <p className={styles.dataScope}>
            Sesiunea poate expira mai devreme. Aceste valori descriu politica de
            acces; timpul rămas nu este disponibil.
          </p>
        </section>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Mai mult control, în curând.</h2>
            <p>Acțiunile de mai jos nu sunt disponibile în această etapă.</p>
          </div>
        </div>
        {[
          ["Sesiuni active", "Vizualizarea și revocarea altor sesiuni."],
          [
            "Activitate de securitate",
            "Jurnalul de audit și evenimentele contului.",
          ],
          [
            "Recuperare MFA",
            "Recuperarea accesului necesită verificarea identității și aprobarea proprietarilor autorizați.",
          ],
        ].map(([title, description]) => (
          <div className={styles.futureRow} key={title}>
            <div>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
            <button
              disabled
              title="Funcția necesită o implementare dedicată și verificări de securitate."
            >
              În dezvoltare
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
export function TeamView({ actor }: { actor: Actor }) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    adminApi<{ staff: StaffMember[] }>("/api/admin/team")
      .then((value) => {
        if (active) setStaff(value.staff);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <h2>O echipă. Permisiuni clare.</h2>
          <p>
            Directorul echipei autorizate. Atribuirea solicitărilor este
            disponibilă pentru editori și administratori.
          </p>
        </div>
        <Action
          icon="plus"
          disabled
          title="Invitarea utilizatorilor nu este implementată în această etapă."
        >
          Invită un coleg
        </Action>
      </div>
      {error ? (
        <Notice error>{error}</Notice>
      ) : !staff ? (
        <Skeleton />
      ) : staff.length ? (
        staff.map((member) => (
          <div className={styles.teamIdentity} key={member.id}>
            <span className={styles.avatar}>
              {member.email.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{member.email}</strong>
              <p>
                {member.id === actor.id ? "Contul tău · " : ""}
                {member.role}
              </p>
            </div>
          </div>
        ))
      ) : (
        <EmptyState title="Niciun membru disponibil">
          Actualizează pagina pentru a verifica directorul.
        </EmptyState>
      )}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Permisiunile rolurilor administrative
          </caption>
          <thead>
            <tr>
              <th scope="col">Rol</th>
              <th scope="col">Solicitări & fișiere</th>
              <th scope="col">Conținut</th>
              <th scope="col">Publicare</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vizualizare</td>
              <td>Consultă</td>
              <td>Consultă</td>
              <td>Nu</td>
            </tr>
            <tr>
              <td>Editor</td>
              <td>Consultă și actualizează starea</td>
              <td>Editează ciorne</td>
              <td>Nu</td>
            </tr>
            <tr>
              <td>Administrator</td>
              <td>Consultă și actualizează starea</td>
              <td>Editează ciorne</td>
              <td>Da</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={styles.moduleNote}>
        <AdminIcon name="shield" />
        <p>
          Modificarea rolurilor și gestionarea conturilor nu sunt disponibile
          aici. Sunt necesare funcții dedicate, cu autorizare și audit.
        </p>
      </div>
    </section>
  );
}
