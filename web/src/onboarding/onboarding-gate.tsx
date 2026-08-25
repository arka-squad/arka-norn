import { useEffect, useRef, useState, type ReactNode } from "react";

import type { WebPreferences } from "../../../src/application/web/contracts";
import { ErrorState, LoadingState } from "../components/ui";
import { useAsync } from "../hooks/use-async";
import { useBridge } from "../bridge/context";
import { projectRoute } from "../app/router";
import { decideOnboarding } from "./onboarding-model";
import { Onboarding } from "./onboarding";

export function OnboardingGate(props: {
  readonly preferences: WebPreferences;
  readonly onPreferences: (preferences: WebPreferences) => void;
  readonly navigate: (path: string) => void;
  readonly children: ReactNode;
}) {
  const bridge = useBridge();
  const projects = useAsync(() => bridge.listProjects(), [bridge]);
  const [paused, setPaused] = useState(false);
  const legacyPreferencesSeeded = useRef(false);
  useEffect(() => {
    const profile = props.preferences.humanProfile;
    const project = projects.data?.[0];
    if (legacyPreferencesSeeded.current || profile === undefined || props.preferences.onboarding !== undefined || project === undefined) return;
    legacyPreferencesSeeded.current = true;
    void bridge.savePreferences({ onboarding: {
      status: "not_started",
      step: 2,
      projectId: project.id,
      lastRoute: projectRoute(project.id),
    } }).then(props.onPreferences).catch(() => { legacyPreferencesSeeded.current = false; });
  }, [bridge, projects.data, props.onPreferences, props.preferences.humanProfile, props.preferences.onboarding]);
  if (projects.loading && projects.data === undefined) return <div className="onboarding-loading"><LoadingState /></div>;
  if (projects.error !== undefined || projects.data === undefined) return <div className="onboarding-loading"><ErrorState error={projects.error} retry={projects.reload} /></div>;
  const entry = decideOnboarding(props.preferences, projects.data);
  if (!paused && entry.active && entry.step !== undefined) {
    return <Onboarding
      preferences={props.preferences}
      projects={projects.data}
      initialStep={entry.step}
      {...(entry.progress === undefined ? {} : { initialProgress: entry.progress })}
      recovery={entry.recovery}
      onPreferences={props.onPreferences}
      onPause={() => setPaused(true)}
      navigate={props.navigate}
    />;
  }
  return props.children;
}
