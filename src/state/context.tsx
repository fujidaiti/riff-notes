import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { initialState, reducer } from "./reducer";
import { loadProject, saveProject, flushSave } from "./persistence";
import type { Action, AppState } from "./types";

// Split contexts so a component that only dispatches never re-renders when
// state changes, and vice versa. This is the main mitigation for Context's
// "re-render every consumer" behavior; combine it with React.memo on the
// heavy grid components and per-part selectors.
const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(loadProject() ?? undefined));

  // Persist on every project change (debounced inside saveProject); flush on
  // pagehide so the last edits aren't lost.
  useEffect(() => {
    saveProject(state.project);
  }, [state.project]);

  useEffect(() => {
    const flush = () => flushSave();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  return (
    <DispatchContext.Provider value={dispatch}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </DispatchContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}

export function useDispatch(): Dispatch<Action> {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("useDispatch must be used within AppProvider");
  return ctx;
}
