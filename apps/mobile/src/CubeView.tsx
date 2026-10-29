import { puzzleRenderPalette } from "./design/tokens";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  PanResponder,
  AccessibilityInfo,
  Platform,
  AppState,
} from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";
import {
  COLORS,
  FACES,
  facelets,
  stateKey,
  turn,
  type CubeState,
} from "@cubers/core";
import {
  buildCubeGroup,
  clearCubeGroup as clear,
  cubeFaceAt,
} from "./cube-scene";
import { PuzzleGesture } from "./puzzle-gesture";
import { Txt, Row, useTheme } from "./ui";
import { useApp } from "./state";
const build = (group: THREE.Group, state: CubeState) =>
  buildCubeGroup(group, state, Platform.OS !== "web");
export function CubeView({
  state,
  lastMove,
  onTurn,
  height = 290,
  showFaces = true,
}: {
  state: CubeState;
  lastMove?: string;
  onTurn?: (move: string) => void;
  height?: number;
  showFaces?: boolean;
}) {
  const { t } = useApp();
  const c = useTheme(),
    onTurnRef = useRef(onTurn),
    sceneRef = useRef<
      | {
          scene: THREE.Scene;
          group: THREE.Group;
          renderer: THREE.WebGLRenderer;
          camera: THREE.PerspectiveCamera;
          gl: ExpoWebGLRenderingContext;
          frame: number;
          dirty: boolean;
        }
      | undefined
    >(undefined),
    current = useRef(state),
    moveRef = useRef(lastMove),
    [error, setError] = useState(""),
    reduced = useRef(false),
    gesture = useRef(new PuzzleGesture()),
    viewport = useRef({ width: 0, height: 0 }),
    animation = useRef<{
      time: number;
      group: THREE.Group;
      axis: number;
      angle: number;
      next: CubeState;
    } | null>(null);
  onTurnRef.current = onTurn;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(
      (v) => (reduced.current = v),
    );
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v) => (reduced.current = v),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const r = sceneRef.current;
    if (!r) {
      current.current = state;
      return;
    }
    r.dirty = true;
    const move = lastMove,
      m = /^([URFDLBMESxyz])(w)?(2|')?$/.exec(move || "");
    let oneTurn = false;
    if (m && current.current.size === state.size) {
      try {
        oneTurn = stateKey(turn(current.current, move!)) === stateKey(state);
      } catch {}
    }
    // Fresh snapshots can repeat a position or contain several recovered turns.
    // Animate only a turn that actually reaches the next displayed position.
    if (m && oneTurn && !reduced.current && current.current !== state) {
      if (animation.current) {
        build(r.group, current.current);
        animation.current = null;
      }
      const [, f, w, suffix] = m,
        axis = "RLMx".includes(f) ? 0 : "UDEy".includes(f) ? 1 : 2;
      const high = "RUF".includes(f),
        whole = "xyz".includes(f),
        slice = "MES".includes(f),
        turning = new THREE.Group();
      r.group.add(turning);
      for (const mesh of [...r.group.children]) {
        if (mesh === turning) continue;
        const a = mesh.userData.position?.[axis];
        if (a === undefined) continue;
        if (
          whole ||
          (slice
            ? a === 1
            : high
              ? a >= state.size - 1 - (w ? 1 : 0)
              : a <= (w ? 1 : 0))
        )
          turning.add(mesh);
      }
      const dir = ("RUFxyzS".includes(f) ? -1 : 1) * (suffix === "'" ? -1 : 1);
      animation.current = {
        time: performance.now(),
        group: turning,
        axis,
        angle: ((dir * Math.PI) / 2) * (suffix === "2" ? 2 : 1),
        next: state,
      };
    } else {
      animation.current = null;
      build(r.group, state);
    }
    current.current = state;
    moveRef.current = lastMove;
  }, [state, lastMove]);
  useEffect(
    () => () => {
      const r = sceneRef.current;
      if (r) {
        cancelAnimationFrame(r.frame);
        clear(r.group);
        r.renderer.dispose();
        sceneRef.current = undefined;
        gesture.current.cancel();
      }
    },
    [],
  );
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event, g) => {
        gesture.current.begin(
          event.nativeEvent.locationX,
          event.nativeEvent.locationY,
          g.numberActiveTouches,
        );
      },
      onPanResponderStart: (_, g) =>
        gesture.current.observeTouches(g.numberActiveTouches),
      onPanResponderMove: (_, g) => {
        const delta = gesture.current.move(g.dx, g.dy, g.numberActiveTouches);
        const r = sceneRef.current;
        if (r && delta) {
          r.group.rotation.y += delta.x * 0.01;
          r.group.rotation.x += delta.y * 0.01;
          r.dirty = true;
        }
      },
      onPanResponderRelease: (_, g) => {
        const point = gesture.current.finish(g.dx, g.dy),
          r = sceneRef.current;
        if (!point || !r || animation.current || !onTurnRef.current) return;
        const face = cubeFaceAt(r.group, r.camera, point, viewport.current);
        if (face) onTurnRef.current(face);
      },
      onPanResponderTerminate: () => gesture.current.cancel(),
    }),
  ).current;
  async function context(gl: ExpoWebGLRenderingContext) {
    try {
      const canvas = {
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        getContext: () => gl,
      };
      const renderer = new THREE.WebGLRenderer({
        context: gl as any,
        canvas: canvas as any,
        antialias: true,
        alpha: true,
      });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
      renderer.setClearColor(puzzleRenderPalette.clear, 0);
      const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(
          36,
          gl.drawingBufferWidth / gl.drawingBufferHeight,
          0.1,
          100,
        );
      camera.position.set(4, 3.4, 5.8);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.AmbientLight(puzzleRenderPalette.ambient, 2));
      const light = new THREE.DirectionalLight(puzzleRenderPalette.light, 3);
      light.position.set(4, 7, 6);
      scene.add(light);
      const group = new THREE.Group();
      scene.add(group);
      build(group, current.current);
      sceneRef.current = {
        scene,
        renderer,
        camera,
        group,
        gl,
        frame: 0,
        dirty: true,
      };
      function draw() {
        const r = sceneRef.current;
        if (!r) return;
        const a = animation.current;
        if (a) {
          const progress = Math.min(1, (performance.now() - a.time) / 180);
          a.group.rotation[(["x", "y", "z"] as const)[a.axis]] =
            a.angle * (1 - (1 - progress) ** 3);
          if (progress === 1) {
            animation.current = null;
            build(r.group, a.next);
          }
        }
        // Idle puzzles do not enqueue another full native GL draw every frame.
        // Software-backed contexts otherwise starve move and navigation events.
        if (Platform.OS === "web" || r.dirty || a) {
          r.renderer.render(r.scene, r.camera);
          gl.endFrameEXP();
          r.dirty = false;
        }
        r.frame = requestAnimationFrame(draw);
      }
      draw();
    } catch {
      const failed = sceneRef.current;
      sceneRef.current = undefined;
      gesture.current.cancel();
      if (failed) {
        cancelAnimationFrame(failed.frame);
        clear(failed.group);
        failed.renderer.dispose();
      }
      setError(
        t(
          "3D rendering unavailable on this device. The labeled face view below remains usable.",
          "此设备暂无法显示三维画面，下方带标记的平面视图仍可使用。",
        ),
      );
    }
  }
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active" && sceneRef.current)
        sceneRef.current.dirty = true;
    });
    return () => subscription.remove();
  }, []);
  const faces = facelets(state);
  return (
    <View style={{ gap: 12 }}>
      <View
        accessibilityLabel={
          (onTurn
            ? t(
                "Interactive 3D puzzle. Drag to rotate the view. Tap a colored sticker to turn its face clockwise.",
                "交互三维魔方。拖动改变视角，点击彩色贴片以顺时针转动该面。",
              )
            : t(
                "Read-only 3D puzzle. Drag to rotate the view.",
                "只读三维魔方。拖动改变视角。",
              )) +
          (Platform.OS === "web" && !showFaces
            ? " " +
              FACES.map((face) => `${face}: ${faces[face].join(" ")}`).join(
                "; ",
              )
            : "")
        }
        accessibilityValue={{
          text: FACES.map((face) => `${face}: ${faces[face].join(" ")}`).join(
            "; ",
          ),
        }}
        onLayout={(event) => {
          viewport.current = {
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          };
        }}
        {...pan.panHandlers}
        style={{
          height,
          borderRadius: 24,
          overflow: "hidden",
          backgroundColor: c.field,
        }}
      >
        {error ? (
          <Txt small style={{ padding: 25 }}>
            {error}
          </Txt>
        ) : (
          <GLView style={{ flex: 1 }} onContextCreate={context} />
        )}
      </View>
      {showFaces && (
        <Row style={{ justifyContent: "center", gap: 12 }}>
          {FACES.map((f) => (
            <View
              key={f}
              accessibilityLabel={`Face ${f}: ${faces[f].join(" ")}`}
              style={{ gap: 5, alignItems: "center" }}
            >
              <Txt small style={{ fontWeight: "700" }}>
                {f}
              </Txt>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  width: state.size * 10,
                  gap: 1,
                }}
              >
                {faces[f].map((color, i) => (
                  <View
                    key={i}
                    style={{
                      width: 9,
                      height: 9,
                      backgroundColor: COLORS[color],
                      borderWidth: 0.5,
                      borderColor: puzzleRenderPalette.cubeOutline,
                      borderRadius: 1,
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
        </Row>
      )}
    </View>
  );
}
