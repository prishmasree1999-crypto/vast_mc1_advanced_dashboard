
import json

import re

from pathlib import Path

import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_FILE = PROJECT_ROOT / "data_raw" / "MC1_final_00.json"
OUT_DIR = PROJECT_ROOT / "data_clean"
OUT_DIR.mkdir(exist_ok=True)

BREACH_DATE = "2046-06-05"
BREACH_TS = pd.Timestamp("2046-06-05T17:25:00")
EMBARGO_TS = pd.Timestamp("2046-06-05T18:00:00")
JUDGE_WARNING_TS = pd.Timestamp("2046-06-05T15:08:00")

PUBLIC_CHANNELS = ["official_post", "personal_post", "anonymous_post"]

KEYWORD_GROUPS = {
    "CivicLoom": ["civicloom"],
    "HarborCrest": ["harborcrest"],
    "merger": ["merger"],
    "embargo": ["embargo"],
    "SaltWind": ["saltwind"],
    "Section 4.3(c)": ["section 4.3", "4.3(c)", "4.3"],
    "MAC clause": ["mac clause", "material adverse", "mac"],
    "consent": ["consent"],
    "GO": [" go ", "go.", "go:", "go command"],
    "breach": ["breach", "leak", "disclosure"]
}


def safe_text(value):
    if value is None:
        return ""
    if isinstance(value, list):
        return "; ".join(str(v) for v in value)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def get_internal_state(message, key):
    state = message.get("internal_state")
    if not isinstance(state, dict):
        return ""
    return safe_text(state.get(key))


def count_keyword_group(text, words):
    text = f" {str(text).lower()} "
    count = 0
    for word in words:
        count += text.count(word.lower())
    return count


def make_short(text, limit=170):
    text = re.sub(r"\s+", " ", safe_text(text)).strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "..."


def load_messages():
    if not RAW_FILE.exists():
        raise FileNotFoundError(
            f"Cannot find {RAW_FILE}. Put MC1_final_00.json inside data_raw folder."
        )

    with open(RAW_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)

    rows = []

    for round_index, round_obj in enumerate(raw.get("rounds", []), start=1):
        context = round_obj.get("environment_context", {})
        round_hour = round_obj.get("hour", "")

        for msg in round_obj.get("communications", []):
            ts = pd.Timestamp(msg.get("timestamp"))

            content = safe_text(msg.get("content"))
            reacting = get_internal_state(msg, "reacting")
            rationalizing = get_internal_state(msg, "rationalizing")
            deliberating = get_internal_state(msg, "deliberating")

            full_text = " ".join([content, reacting, rationalizing, deliberating])

            keyword_total = sum(
                count_keyword_group(full_text, words)
                for words in KEYWORD_GROUPS.values()
            )

            rows.append({
                "round_index": round_index,
                "round_hour": round_hour,
                "message_id": msg.get("message_id", ""),
                "timestamp": ts,
                "date": ts.date().isoformat(),
                "time": ts.time().isoformat(),
                "hour": ts.floor("h"),
                "agent_id": msg.get("agent_id", ""),
                "agent_role": msg.get("agent_role", ""),
                "agent_label": msg.get("agent_label", msg.get("agent_id", "")),
                "channel": msg.get("channel", ""),
                "message_type": msg.get("message_type", ""),
                "recipients": safe_text(msg.get("recipients")),
                "responding_to": safe_text(msg.get("responding_to")),
                "content": content,
                "reacting": reacting,
                "rationalizing": rationalizing,
                "deliberating": deliberating,
                "full_text": full_text,
                "event_headline": safe_text(context.get("event_headline")),
                "event_narrative": safe_text(context.get("event_narrative")),
                "market_sentiment": safe_text(context.get("market_snapshot", {}).get("sentiment")),
                "stock_price": safe_text(context.get("market_snapshot", {}).get("stock_price")),
                "percent_change": safe_text(context.get("market_snapshot", {}).get("percent_change")),
                "is_public": msg.get("channel", "") in PUBLIC_CHANNELS,
                "pre_embargo": ts < EMBARGO_TS,
                "pre_breach": ts < BREACH_TS,
                "keyword_total": keyword_total
            })

    df = pd.DataFrame(rows)
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def create_agent_daily_activity(df):
    daily = (
        df.groupby(["date", "agent_id", "agent_label"], as_index=False)
        .size()
        .rename(columns={"size": "message_count"})
    )

    baseline = (
        daily[daily["date"] < BREACH_DATE]
        .groupby(["agent_id", "agent_label"], as_index=False)["message_count"]
        .mean()
        .rename(columns={"message_count": "baseline_daily_mean"})
    )

    breach = (
        daily[daily["date"] == BREACH_DATE]
        .groupby(["agent_id", "agent_label"], as_index=False)["message_count"]
        .sum()
        .rename(columns={"message_count": "june5_count"})
    )

    comparison = baseline.merge(breach, on=["agent_id", "agent_label"], how="outer").fillna(0)
    comparison["activity_multiplier"] = comparison.apply(
        lambda r: round(r["june5_count"] / r["baseline_daily_mean"], 2)
        if r["baseline_daily_mean"] > 0 else 0,
        axis=1
    )

    return daily, comparison


def create_channel_daily_activity(df):
    return (
        df.groupby(["date", "channel"], as_index=False)
        .size()
        .rename(columns={"size": "message_count"})
    )


def create_agent_channel_matrix(df):
    return (
        df.groupby(["agent_label", "agent_id", "channel"], as_index=False)
        .size()
        .rename(columns={"size": "message_count"})
    )


def create_keyword_daily_mentions(df):
    rows = []

    for _, row in df.iterrows():
        full_text = row["full_text"]
        for keyword, words in KEYWORD_GROUPS.items():
            count = count_keyword_group(full_text, words)
            if count > 0:
                rows.append({
                    "date": row["date"],
                    "timestamp": row["timestamp"],
                    "agent_id": row["agent_id"],
                    "agent_label": row["agent_label"],
                    "channel": row["channel"],
                    "keyword": keyword,
                    "count": count
                })

    kw = pd.DataFrame(rows)

    if kw.empty:
        return pd.DataFrame(columns=["date", "keyword", "count"])

    return (
        kw.groupby(["date", "keyword"], as_index=False)["count"]
        .sum()
        .sort_values(["date", "keyword"])
    )


def create_june5_hourly_activity(df):
    june5 = df[df["date"] == BREACH_DATE].copy()

    return (
        june5.groupby(["hour", "agent_id", "agent_label", "channel"], as_index=False)
        .size()
        .rename(columns={"size": "message_count"})
    )


def create_risk_scores(df, activity_comparison):
    rows = []

    agents = sorted(df["agent_id"].dropna().unique())

    max_multiplier = max(activity_comparison["activity_multiplier"].max(), 1)

    for agent in agents:
        agent_df = df[df["agent_id"] == agent]
        label = agent_df["agent_label"].iloc[0]

        multiplier_row = activity_comparison[activity_comparison["agent_id"] == agent]
        if len(multiplier_row) > 0:
            multiplier = float(multiplier_row["activity_multiplier"].iloc[0])
            june5_count = int(multiplier_row["june5_count"].iloc[0])
            baseline = float(multiplier_row["baseline_daily_mean"].iloc[0])
        else:
            multiplier = 0
            june5_count = 0
            baseline = 0

        side_huddle_count = int((agent_df["channel"] == "side_huddle").sum())

        public_pre_embargo = int(
            (
                (agent_df["is_public"] == True)
                & (agent_df["timestamp"] < EMBARGO_TS)
                & (agent_df["date"] == BREACH_DATE)
            ).sum()
        )

        keyword_count = int(agent_df["keyword_total"].sum())

        role_risk = 0
        if agent == "legal_agent":
            role_risk = 100
        elif agent == "social_media_agent":
            role_risk = 80
        elif agent == "judge_agent":
            role_risk = 75
        elif agent == "pr_agent":
            role_risk = 50
        elif agent == "pr_intern_agent":
            role_risk = 35
        else:
            role_risk = 20

        judge_silence_risk = 0
        if agent == "judge_agent":
            after_warning = agent_df[agent_df["timestamp"] > JUDGE_WARNING_TS]
            judge_silence_risk = 100 if len(after_warning) == 0 else 20

        volume_risk = min(100, round((multiplier / max_multiplier) * 100, 2))
        side_huddle_risk = min(100, side_huddle_count * 4)
        public_risk = min(100, public_pre_embargo * 20)
        keyword_risk = min(100, keyword_count * 1.5)

        risk_score = round(
            (volume_risk * 0.25)
            + (side_huddle_risk * 0.20)
            + (public_risk * 0.20)
            + (keyword_risk * 0.20)
            + (role_risk * 0.10)
            + (judge_silence_risk * 0.05),
            2
        )

        if risk_score >= 70:
            category = "High risk"
        elif risk_score >= 45:
            category = "Medium risk"
        elif agent == "judge_agent":
            category = "Compliance failure"
        else:
            category = "Lower risk"

        rows.append({
            "agent_id": agent,
            "agent_label": label,
            "baseline_daily_mean": round(baseline, 2),
            "june5_count": june5_count,
            "activity_multiplier": multiplier,
            "side_huddle_count": side_huddle_count,
            "public_pre_embargo": public_pre_embargo,
            "keyword_count": keyword_count,
            "volume_risk": volume_risk,
            "side_huddle_risk": side_huddle_risk,
            "public_risk": public_risk,
            "keyword_risk": keyword_risk,
            "role_risk": role_risk,
            "judge_silence_risk": judge_silence_risk,
            "risk_score": risk_score,
            "risk_category": category
        })

    return pd.DataFrame(rows).sort_values("risk_score", ascending=False)


def create_evidence_events(df):
    evidence = []

    def add_event(event_id, event_type, timestamp, agent_id, channel, title, finding, content):
        evidence.append({
            "event_id": event_id,
            "event_type": event_type,
            "timestamp": timestamp,
            "agent_id": agent_id,
            "channel": channel,
            "title": title,
            "finding": finding,
            "evidence_text": make_short(content, 240)
        })

    side = df[df["channel"] == "side_huddle"].sort_values("timestamp")
    if len(side) > 0:
        r = side.iloc[0]
        add_event(
            "E1",
            "Early warning",
            r["timestamp"],
            r["agent_id"],
            r["channel"],
            "Shadow channel activated",
            "side_huddle begins before the breach and shows off-record coordination.",
            r["content"]
        )

    may29 = df[
        (df["date"] == "2046-05-29")
        & (df["keyword_total"] > 0)
    ].sort_values("timestamp")
    if len(may29) > 0:
        r = may29.iloc[0]
        add_event(
            "E2",
            "Early warning",
            r["timestamp"],
            r["agent_id"],
            r["channel"],
            "Sensitive keywords before June 5",
            "Merger-related language appears before the breach day.",
            r["content"]
        )

    judge_warning = df[
        (df["agent_id"] == "judge_agent")
        & (
            df["content"].str.contains("COMPLIANCE_WARNING", case=False, na=False)
            | df["deliberating"].str.contains("COMPLIANCE_WARNING", case=False, na=False)
        )
    ].sort_values("timestamp")
    if len(judge_warning) > 0:
        r = judge_warning.iloc[0]
        add_event(
            "E3",
            "Compliance warning",
            r["timestamp"],
            r["agent_id"],
            r["channel"],
            "Judge-Agent warning",
            "Judge-Agent warned about elevated disclosure risk and then went silent.",
            r["content"]
        )

    section = df[
        (df["date"] == BREACH_DATE)
        & (
            df["content"].str.contains("4.3", case=False, na=False)
            | df["deliberating"].str.contains("4.3", case=False, na=False)
            | df["content"].str.contains("mutual-consent", case=False, na=False)
            | df["deliberating"].str.contains("mutual-consent", case=False, na=False)
        )
    ].sort_values("timestamp")
    if len(section) > 0:
        r = section.iloc[0]
        add_event(
            "E4",
            "Decision point",
            r["timestamp"],
            r["agent_id"],
            r["channel"],
            "Section 4.3(c) invoked",
            "Legal-Agent used a contract clause to justify early disclosure.",
            r["content"]
        )

    breach = df[
        (df["date"] == BREACH_DATE)
        & (df["agent_id"] == "legal_agent")
        & (df["is_public"] == True)
        & (df["timestamp"] < EMBARGO_TS)
        & (df["timestamp"] >= pd.Timestamp("2046-06-05T17:00:00"))
    ].sort_values("timestamp")
    if len(breach) > 0:
        r = breach.iloc[0]
        add_event(
            "E5",
            "Breach",
            r["timestamp"],
            r["agent_id"],
            r["channel"],
            "First public breach post",
            "Legal-Agent made the first public confirmation before the 6:00 PM embargo.",
            r["content"]
        )

    amp = df[
        (df["date"] == BREACH_DATE)
        & (df["agent_id"] == "social_media_agent")
        & (df["is_public"] == True)
        & (df["timestamp"] < EMBARGO_TS)
        & (df["timestamp"] >= pd.Timestamp("2046-06-05T17:00:00"))
    ].sort_values("timestamp")
    if len(amp) > 0:
        r = amp.iloc[0]
        add_event(
            "E6",
            "Amplification",
            r["timestamp"],
            r["agent_id"],
            r["channel"],
            "Social-Agent amplification",
            "Social-Media-Agent amplified the disclosure immediately after Legal-Agent.",
            r["content"]
        )

    add_event(
        "E7",
        "Milestone",
        EMBARGO_TS,
        "system",
        "official_post",
        "Official embargo expiry",
        "The public disclosure happened before this official embargo time.",
        "Official embargo was scheduled for 6:00 PM."
    )

    return pd.DataFrame(evidence)


def create_causal_graph():
    nodes = pd.DataFrame([
        {
            "id": "N1",
            "label": "Shadow channel",
            "timestamp": "2046-05-22T09:00:00",
            "agent": "quality_agent",
            "channel": "side_huddle",
            "severity": 35,
            "summary": "Off-record side_huddle begins before breach."
        },
        {
            "id": "N2",
            "label": "Merger signals",
            "timestamp": "2046-05-29T09:00:00",
            "agent": "social_media_agent",
            "channel": "comms_huddle",
            "severity": 45,
            "summary": "Sensitive merger-related language appears before June 5."
        },
        {
            "id": "N3",
            "label": "SaltWind pressure",
            "timestamp": "2046-06-05T09:00:00",
            "agent": "external",
            "channel": "media",
            "severity": 60,
            "summary": "External publication increases pressure and stock risk."
        },
        {
            "id": "N4",
            "label": "Judge warning",
            "timestamp": "2046-06-05T15:08:00",
            "agent": "judge_agent",
            "channel": "comms_huddle",
            "severity": 75,
            "summary": "Judge-Agent warns about aggregation and disclosure risk."
        },
        {
            "id": "N5",
            "label": "Judge silence",
            "timestamp": "2046-06-05T15:10:00",
            "agent": "judge_agent",
            "channel": "comms_huddle",
            "severity": 80,
            "summary": "Judge-Agent sends no further messages after warning."
        },
        {
            "id": "N6",
            "label": "4.3(c) invoked",
            "timestamp": "2046-06-05T17:01:00",
            "agent": "legal_agent",
            "channel": "comms_huddle",
            "severity": 90,
            "summary": "Legal-Agent uses Section 4.3(c) to justify acceleration."
        },
        {
            "id": "N7",
            "label": "Legal breach post",
            "timestamp": "2046-06-05T17:25:00",
            "agent": "legal_agent",
            "channel": "personal_post",
            "severity": 100,
            "summary": "Legal-Agent makes first public disclosure before embargo expiry."
        },
        {
            "id": "N8",
            "label": "Social amplification",
            "timestamp": "2046-06-05T17:26:00",
            "agent": "social_media_agent",
            "channel": "personal_post",
            "severity": 95,
            "summary": "Social-Media-Agent amplifies the breach."
        },
        {
            "id": "N9",
            "label": "Embargo expiry",
            "timestamp": "2046-06-05T18:00:00",
            "agent": "system",
            "channel": "official_post",
            "severity": 50,
            "summary": "Official disclosure time arrives after breach already occurred."
        }
    ])

    edges = pd.DataFrame([
        {"source": "N1", "target": "N2", "strength": 30, "mechanism": "Private coordination made later warning signals harder to monitor."},
        {"source": "N2", "target": "N3", "strength": 40, "mechanism": "Earlier merger signals increased public and internal sensitivity."},
        {"source": "N3", "target": "N4", "strength": 60, "mechanism": "External pressure triggered compliance concern."},
        {"source": "N4", "target": "N5", "strength": 75, "mechanism": "The Judge warned but did not enforce."},
        {"source": "N5", "target": "N6", "strength": 80, "mechanism": "Compliance silence allowed Legal-Agent to self-authorise."},
        {"source": "N6", "target": "N7", "strength": 95, "mechanism": "Section 4.3(c) became the legal justification for early public disclosure."},
        {"source": "N7", "target": "N8", "strength": 85, "mechanism": "Social-Agent amplified the Legal-Agent disclosure."},
        {"source": "N8", "target": "N9", "strength": 45, "mechanism": "Embargo expiry occurred after the breach had already happened."}
    ])

    return nodes, edges


def main():
    print("Reading JSON dataset...")
    df = load_messages()

    print(f"Messages extracted: {len(df)}")

    daily, activity_comparison = create_agent_daily_activity(df)
    channel_daily = create_channel_daily_activity(df)
    agent_channel = create_agent_channel_matrix(df)
    keyword_daily = create_keyword_daily_mentions(df)
    june5_hourly = create_june5_hourly_activity(df)
    risk_scores = create_risk_scores(df, activity_comparison)
    evidence = create_evidence_events(df)
    causal_nodes, causal_edges = create_causal_graph()

    df.drop(columns=["full_text"]).to_csv(OUT_DIR / "messages_clean.csv", index=False)
    daily.to_csv(OUT_DIR / "agent_daily_activity.csv", index=False)
    activity_comparison.to_csv(OUT_DIR / "agent_activity_comparison.csv", index=False)
    channel_daily.to_csv(OUT_DIR / "channel_daily_activity.csv", index=False)
    agent_channel.to_csv(OUT_DIR / "agent_channel_matrix.csv", index=False)
    keyword_daily.to_csv(OUT_DIR / "keyword_daily_mentions.csv", index=False)
    june5_hourly.to_csv(OUT_DIR / "june5_hourly_activity.csv", index=False)
    risk_scores.to_csv(OUT_DIR / "agent_risk_scores.csv", index=False)
    evidence.to_csv(OUT_DIR / "evidence_events.csv", index=False)
    causal_nodes.to_csv(OUT_DIR / "causal_nodes.csv", index=False)
    causal_edges.to_csv(OUT_DIR / "causal_edges.csv", index=False)

    print("Clean files created in data_clean folder.")
    print("Now open visualisation/index.html using Live Server.")


if __name__ == "__main__":
    main()