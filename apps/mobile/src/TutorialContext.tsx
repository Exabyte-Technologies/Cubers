import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";
import { useNavigation } from "expo-router";
import type { AlgorithmCoaching } from "@cubers/core";

type Bounds = { x: number; y: number; width: number; height: number };
import {
  registerTutorial,
  advanceTutorial,
  type TutorialFlow as Flow,
} from "./tutorial-flow";
const Context = createContext<{
  flow: Flow | null;
  register: (coaching: AlgorithmCoaching | null, cursor: number) => void;
  next: () => void;
  showAlgorithm: () => void;
  focused: boolean;
  focus: (bounds: Bounds | null) => void;
  outside: (x: number, y: number) => void;
}>({
  flow: null,
  register: () => {},
  next: () => {},
  showAlgorithm: () => {},
  focused: false,
  focus: () => {},
  outside: () => {},
});
export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [flow, setFlow] = useState<Flow | null>(null),
    [bounds, setBounds] = useState<Bounds | null>(null);
  const navigation = useNavigation();
  const register = useCallback(
    (coaching: AlgorithmCoaching | null, cursor: number) => {
      setFlow((previous) => registerTutorial(previous, coaching, cursor));
    },
    [],
  );
  useEffect(() => {
    if (!bounds) return;
    navigation.setOptions({
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
    } as any);
    return () =>
      navigation.setOptions({
        gestureEnabled: undefined,
        fullScreenGestureEnabled: undefined,
      } as any);
  }, [!!bounds, navigation]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status !== "active") setBounds(null);
    });
    return () => subscription.remove();
  }, []);
  return (
    <Context.Provider
      value={{
        flow,
        register,
        showAlgorithm: () =>
          setFlow((f) =>
            f
              ? {
                  ...f,
                  index: Math.max(
                    0,
                    f.coaching.instructions!.findIndex(
                      (i) => i.kind === "perform",
                    ),
                  ),
                }
              : f,
          ),
        next: () => setFlow(advanceTutorial),
        focused: !!bounds,
        focus: setBounds,
        outside: (x, y) => {
          if (
            bounds &&
            (x < bounds.x ||
              y < bounds.y ||
              x > bounds.x + bounds.width ||
              y > bounds.y + bounds.height)
          )
            setBounds(null);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useTutorial() {
  const context = useContext(Context);
  const instruction = context.flow?.coaching.instructions?.[context.flow.index];
  return {
    ...context,
    instruction,
    observing: !!instruction && instruction.kind !== "perform",
  };
}
