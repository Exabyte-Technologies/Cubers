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
import Svg, { Polygon, Text as SvgText } from "react-native-svg";
import {
  PYRA_FACES,
  PYRA_POINTS,
  pyraminxFacelets,
  COLORS,
  type PyraminxState,
  type PyraColor,
} from "@cubers/core";
import { Row, Txt, useTheme } from "./ui";
import { useApp } from "./state";
import {
  buildPyraminxGroup,
  clearPyraminxGroup as clear,
  pyraminxTurnAt,
  pyraminxAnimatedTurn,
  previewPyraminxSelection,
  pyraminxDragAngle,
} from "./pyraminx-scene";
import { useTutorial } from "./TutorialContext";
import { highlightTutorialStickers } from "./tutorial-visuals";
import { PuzzleGesture } from "./puzzle-gesture";
import { buildPyraminxTurnCue, animateTurnCue } from "./turn-cue";
import { syncPuzzleViewport } from "./puzzle-viewport";
const build = (group: THREE.Group, state: PyraminxState) =>
  buildPyraminxGroup(group, state, Platform.OS !== "web");
export function PyraminxNet({
  colors,
  size = 20,
  onSticker,
}: {
  colors: PyraColor[];
  size?: number;
  onSticker?: (index: number) => void;
}) {
  const height = (size * Math.sqrt(3)) / 2;
  return (
    <Svg
      width={size * 3}
      height={height * 3}
      accessibilityLabel={colors.join(" ")}
    >
      {colors.map((color, index) => {
        const row = Math.floor(Math.sqrt(index)),
          column = index - row * row,
          x = ((2 - row) * size) / 2 + (column * size) / 2,
          y = row * height,
          down = column % 2 === 1;
        const points = down
          ? `${x},${y} ${x + size},${y} ${x + size / 2},${y + height}`
          : `${x + size / 2},${y} ${x},${y + height} ${x + size},${y + height}`;
        return (
          <React.Fragment key={index}>
            <Polygon
              points={points}
              fill={COLORS[color]}
              stroke={puzzleRenderPalette.triangleOutline}
              strokeWidth={1}
              onPress={() => onSticker?.(index)}
              accessibilityLabel={`Sticker ${index + 1}: ${color}`}
            />
            <SvgText
              x={x + size / 2}
              y={y + height * (down ? 0.45 : 0.78)}
              fontSize={size * 0.3}
              textAnchor="middle"
              fill={puzzleRenderPalette.netInk}
              pointerEvents="none"
            >
              {color}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
export function PyraminxView({
  state,
  lastMove,
  onTurn,
  cueMove,
  height = 290,
  showFaces = true,
}: {
  state: PyraminxState;
  lastMove?: string;
  onTurn?: (move: string) => void;
  cueMove?: string;
  height?: number;
  showFaces?: boolean;
}) {
  const tutorial = useTutorial(),
    tutorialRef = useRef(tutorial),
    windowRef = useRef<View>(null);
  tutorialRef.current = tutorial;
  const selected = useRef<string | null>(null),
    lifted = useRef<string | null>(null),
    lift = useRef(0),
    dragAngle = useRef(0),
    previewAngle = useRef(0),
    start = useRef({ x: 0, y: 0 }),
    released = useRef<{ angle: number; time: number } | null>(null),
    viewAnimation = useRef<{
      from: THREE.Quaternion;
      to: THREE.Quaternion;
      time: number;
    } | null>(null),
    visualKey = useRef("");
  useEffect(() => {
    if (!tutorial.focused || tutorial.observing) {
      selected.current = null;
      dragAngle.current = 0;
    }
  }, [tutorial.focused, tutorial.observing]);
  const c = useTheme(),
    { t } = useApp(),
    [error, setError] = useState(false),
    current = useRef(state),
    turnRef = useRef(onTurn),
    cueRef = useRef(cueMove),
    activeRef = useRef(AppState.currentState === "active"),
    reduced = useRef(false),
    gesture = useRef(new PuzzleGesture()),
    viewport = useRef({ width: 0, height: 0 });
  const scene = useRef<{
    group: THREE.Group;
    cue: THREE.Group;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    gl: ExpoWebGLRenderingContext;
    frame: number;
    dirty: boolean;
  } | null>(null);
  const animation = useRef<{
    group: THREE.Group;
    axis: THREE.Vector3;
    angle: number;
    started: number;
    next: PyraminxState;
    fromAngle?: number;
  } | null>(null);
  turnRef.current = onTurn;
  cueRef.current = tutorial.observing ? undefined : cueMove;
  useEffect(() => {
    const r = scene.current;
    if (!r) return;
    clear(r.cue);
    buildPyraminxTurnCue(r.cue, cueMove, c.green);
    r.dirty = true;
  }, [cueMove, c.green]);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => (reduced.current = value),
    );
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => (reduced.current = value),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const r = scene.current,
      previous = current.current;
    current.current = state;
    if (!r) return;
    r.dirty = true;
    previewPyraminxSelection(r.group, null, 0, 0);
    dragAngle.current = 0;
    previewAngle.current = 0;
    const move = pyraminxAnimatedTurn(previous, state, lastMove);
    if (move && !reduced.current) {
      if (animation.current) build(r.group, previous);
      const group = new THREE.Group();
      for (const mesh of [...r.group.children])
        if (mesh.userData.position?.[move.vertex] >= move.threshold)
          group.add(mesh);
      r.group.add(group);
      animation.current = {
        group,
        axis: move.axis,
        angle: move.angle,
        started: performance.now(),
        next: state,
        fromAngle: released.current?.angle || 0,
      };
      released.current = null;
    } else {
      animation.current = null;
      build(r.group, state);
    }
  }, [state, lastMove]);
  function releaseScene() {
    const r = scene.current;
    scene.current = null;
    animation.current = null;
    gesture.current.cancel();
    if (r) {
      cancelAnimationFrame(r.frame);
      clear(r.group);
      clear(r.cue);
      r.renderer.dispose();
    }
  }
  useEffect(() => releaseScene, []);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => !tutorialRef.current.focused,
      onPanResponderGrant: (event, g) => {
        windowRef.current?.measureInWindow((x, y, width, height) =>
          tutorialRef.current.focus({ x, y, width, height }),
        );
        viewAnimation.current = null;
        start.current = {
          x: event.nativeEvent.locationX,
          y: event.nativeEvent.locationY,
        };
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
        if (
          scene.current &&
          delta &&
          selected.current &&
          turnRef.current &&
          !tutorialRef.current.observing
        ) {
          dragAngle.current = pyraminxDragAngle(
            scene.current.group,
            scene.current.camera,
            start.current,
            { x: g.dx, y: g.dy },
            viewport.current,
            selected.current,
          );
          scene.current.dirty = true;
        } else if (scene.current && delta) {
          scene.current.group.rotation.y += delta.x * 0.01;
          scene.current.group.rotation.x += delta.y * 0.01;
          scene.current.dirty = true;
        }
      },
      onPanResponderRelease: (_, g) => {
        const finished = gesture.current.finishGesture(g.dx, g.dy),
          point = finished.tap,
          r = scene.current;
        if (!r || animation.current || released.current) return;
        if (
          finished.drag &&
          selected.current &&
          turnRef.current &&
          !tutorialRef.current.observing
        )
          dragAngle.current = pyraminxDragAngle(
            r.group,
            r.camera,
            start.current,
            { x: g.dx, y: g.dy },
            viewport.current,
            selected.current,
          );
        if (
          finished.drag &&
          selected.current &&
          turnRef.current &&
          !tutorialRef.current.observing &&
          Math.abs(dragAngle.current) > 0.18
        ) {
          released.current = {
            angle: previewAngle.current,
            time: performance.now(),
          };
          const move = selected.current + (dragAngle.current > 0 ? "'" : "");
          dragAngle.current = previewAngle.current;
          turnRef.current(move);
        } else if (point && turnRef.current && !tutorialRef.current.observing) {
          const move = pyraminxTurnAt(
            r.group,
            r.camera,
            point,
            viewport.current,
          );
          selected.current = selected.current === move ? null : move || null;
        }
        if (!released.current) dragAngle.current = 0;
        r.dirty = true;
      },
      onPanResponderTerminate: () => {
        gesture.current.cancel();
        dragAngle.current = 0;
      },
    }),
  ).current;
  function context(gl: ExpoWebGLRenderingContext) {
    let initializing: THREE.WebGLRenderer | undefined;
    try {
      const canvas =
        Platform.OS === "web"
          ? (gl as any).canvas
          : {
              width: gl.drawingBufferWidth,
              height: gl.drawingBufferHeight,
              style: {},
              addEventListener() {},
              removeEventListener() {},
              setAttribute() {},
              getContext: () => gl,
            };
      const renderer = new THREE.WebGLRenderer({
        context: gl as any,
        canvas: canvas as any,
        alpha: true,
        antialias: true,
      });
      initializing = renderer;
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
      renderer.setClearColor(puzzleRenderPalette.clear, 0);
      const world = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(
          36,
          gl.drawingBufferWidth / gl.drawingBufferHeight,
          0.1,
          100,
        );
      camera.position.set(3, 2.6, 5.2);
      camera.lookAt(0, 0.25, 0);
      world.add(new THREE.AmbientLight(puzzleRenderPalette.ambient, 2));
      const light = new THREE.DirectionalLight(puzzleRenderPalette.light, 3);
      light.position.set(4, 7, 6);
      world.add(light);
      const group = new THREE.Group();
      const cue = new THREE.Group();
      world.add(group);
      world.add(cue);
      scene.current = {
        group,
        cue,
        renderer,
        scene: world,
        camera,
        gl,
        frame: 0,
        dirty: true,
      };
      initializing = undefined;
      build(group, current.current);
      buildPyraminxTurnCue(cue, cueRef.current, c.green);
      const pixels = { width: -1, height: -1 };
      function draw() {
        const r = scene.current;
        if (!r) return;
        try {
          const a = animation.current,
            now = performance.now(),
            instruction = tutorialRef.current.instruction;
          const key = JSON.stringify([instruction?.id, instruction?.text]);
          if (visualKey.current !== key) {
            visualKey.current = key;
            r.dirty = true;
            const target = instruction?.viewTarget;
            if (target?.length === 4) {
              const normal = new THREE.Vector3();
              const index = target.indexOf(0);
              if (index >= 0)
                normal
                  .copy(new THREE.Vector3(...PYRA_POINTS[index]))
                  .negate()
                  .normalize();
              viewAnimation.current = {
                from: r.group.quaternion.clone(),
                to: new THREE.Quaternion().setFromUnitVectors(
                  normal,
                  r.camera.position.clone().normalize(),
                ),
                time: now,
              };
            }
          }
          const viewing = viewAnimation.current;
          if (viewing && a) viewing.time = now;
          if (viewing && !tutorialRef.current.focused && !a) {
            const progress = reduced.current
              ? 1
              : Math.min(1, (now - viewing.time) / 600);
            r.group.quaternion.slerpQuaternions(
              viewing.from,
              viewing.to,
              progress * progress * (3 - 2 * progress),
            );
            if (progress === 1) viewAnimation.current = null;
            r.dirty = true;
          }
          const highlighting = highlightTutorialStickers(
            r.group,
            instruction?.highlights || [],
            now,
            reduced.current,
          );
          if (!a) {
            const wanted = selected.current ? 0.08 : 0;
            lift.current = reduced.current
              ? wanted
              : lift.current + (wanted - lift.current) * 0.25;
            if (selected.current) lifted.current = selected.current;
            if (lift.current < 0.001 && !selected.current)
              lifted.current = null;
            if (released.current && now - released.current.time > 2000) {
              released.current = null;
              dragAngle.current = 0;
            }
            previewAngle.current = reduced.current
              ? dragAngle.current
              : previewAngle.current +
                (dragAngle.current - previewAngle.current) * 0.35;
            previewPyraminxSelection(
              r.group,
              lifted.current,
              previewAngle.current,
              lift.current,
            );
            if (selected.current || lift.current > 0.001) r.dirty = true;
          }
          const showCue = !!cueRef.current && !a && activeRef.current;
          r.cue.visible = showCue;
          r.cue.quaternion.copy(r.group.quaternion);
          if (showCue)
            animateTurnCue(r.cue, performance.now(), reduced.current);
          if (a) {
            const progress = reduced.current
              ? 1
              : Math.min(1, (performance.now() - a.started) / 210);
            a.group.quaternion.setFromAxisAngle(
              a.axis,
              (a.fromAngle || 0) +
                (a.angle - (a.fromAngle || 0)) * (1 - (1 - progress) ** 3),
            );
            if (progress === 1) {
              animation.current = null;
              build(r.group, a.next);
            }
          }
          const resized =
            pixels.width !== r.gl.drawingBufferWidth ||
            pixels.height !== r.gl.drawingBufferHeight;
          if (
            syncPuzzleViewport(pixels, r.gl, r.renderer, r.camera) &&
            (Platform.OS === "web" ||
              resized ||
              r.dirty ||
              highlighting ||
              a ||
              (showCue && !reduced.current))
          ) {
            r.renderer.render(r.scene, r.camera);
            r.gl.endFrameEXP();
            r.dirty = false;
          }
          r.frame = requestAnimationFrame(draw);
        } catch {
          releaseScene();
          setError(true);
        }
      }
      draw();
    } catch {
      initializing?.dispose();
      releaseScene();
      setError(true);
    }
  }
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      activeRef.current = status === "active";
      if (status === "active" && scene.current) scene.current.dirty = true;
    });
    return () => subscription.remove();
  }, []);
  const faces = pyraminxFacelets(state);
  return (
    <View style={{ gap: 12 }}>
      <View
        ref={windowRef}
        focusable
        onFocus={() =>
          windowRef.current?.measureInWindow((x, y, width, height) =>
            tutorial.focus({ x, y, width, height }),
          )
        }
        onBlur={() => tutorial.focus(null)}
        {...pan.panHandlers}
        onLayout={(event) => {
          viewport.current = {
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          };
        }}
        accessibilityLabel={
          onTurn
            ? t(
                "Interactive Pyraminx. Drag to rotate the view. Tap a tip or center to select its layer, then drag to turn. Tap again to return to viewing.",
                "交互金字塔。拖动改变视角，点击角尖仅转动该角尖，点击中心贴片以顺时针转动相应主层。",
              )
            : t(
                "Read-only Pyraminx. Drag to rotate the view.",
                "只读金字塔。拖动改变视角。",
              )
        }
        style={{
          height,
          borderRadius: 24,
          borderWidth: 3,
          borderColor: tutorial.focused ? c.blue : "transparent",
          ...(Platform.OS === "web"
            ? ({ touchAction: "none", overscrollBehavior: "contain" } as any)
            : {}),
          overflow: "hidden",
          backgroundColor: c.field,
        }}
      >
        {error ? (
          <Txt small style={{ padding: 25 }}>
            {t(
              "3D is unavailable. Use the labeled triangular faces below.",
              "无法显示 3D，请使用下方带记号的三角面。",
            )}
          </Txt>
        ) : (
          <GLView style={{ flex: 1 }} onContextCreate={context} />
        )}
      </View>
      {onTurn && !error && showFaces && (
        <Txt small>
          {t(
            "Drag to rotate the view. Tap a tip for a tip turn or a center sticker for a main-layer turn. Edge stickers do not turn a layer.",
            "拖动改变视角。点击角尖转动角尖，点击中心贴片转动主层；点击棱块贴片不会转层。",
          )}
        </Txt>
      )}
      {(showFaces || error) && (
        <Row style={{ justifyContent: "center" }}>
          {PYRA_FACES.map((face) => (
            <View
              key={face}
              style={{ gap: 5, alignItems: "center" }}
              accessibilityLabel={`${face}: ${faces[face].join(" ")}`}
            >
              <Txt small>{face}</Txt>
              <PyraminxNet colors={faces[face]} />
            </View>
          ))}
        </Row>
      )}
    </View>
  );
}
