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
} from "./pyraminx-scene";
import { PuzzleGesture } from "./puzzle-gesture";
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
}: {
  state: PyraminxState;
  lastMove?: string;
  onTurn?: (move: string) => void;
}) {
  const c = useTheme(),
    { t } = useApp(),
    [error, setError] = useState(false),
    current = useRef(state),
    turnRef = useRef(onTurn),
    reduced = useRef(false),
    gesture = useRef(new PuzzleGesture()),
    viewport = useRef({ width: 0, height: 0 });
  const scene = useRef<{
    group: THREE.Group;
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
  } | null>(null);
  turnRef.current = onTurn;
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
      };
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
      r.renderer.dispose();
    }
  }
  useEffect(() => releaseScene, []);
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
        if (scene.current && delta) {
          scene.current.group.rotation.y += delta.x * 0.01;
          scene.current.group.rotation.x += delta.y * 0.01;
          scene.current.dirty = true;
        }
      },
      onPanResponderRelease: (_, g) => {
        const point = gesture.current.finish(g.dx, g.dy),
          r = scene.current;
        if (!point || !r || animation.current || !turnRef.current) return;
        const move = pyraminxTurnAt(r.group, r.camera, point, viewport.current);
        if (move) turnRef.current(move);
      },
      onPanResponderTerminate: () => gesture.current.cancel(),
    }),
  ).current;
  function context(gl: ExpoWebGLRenderingContext) {
    let initializing: THREE.WebGLRenderer | undefined;
    try {
      const canvas = {
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
      world.add(group);
      scene.current = {
        group,
        renderer,
        scene: world,
        camera,
        gl,
        frame: 0,
        dirty: true,
      };
      initializing = undefined;
      build(group, current.current);
      function draw() {
        const r = scene.current;
        if (!r) return;
        try {
          const a = animation.current;
          if (a) {
            const progress = reduced.current
              ? 1
              : Math.min(1, (performance.now() - a.started) / 210);
            a.group.quaternion.setFromAxisAngle(
              a.axis,
              a.angle * (1 - (1 - progress) ** 3),
            );
            if (progress === 1) {
              animation.current = null;
              build(r.group, a.next);
            }
          }
          if (Platform.OS === "web" || r.dirty || a) {
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
      if (status === "active" && scene.current) scene.current.dirty = true;
    });
    return () => subscription.remove();
  }, []);
  const faces = pyraminxFacelets(state);
  return (
    <View style={{ gap: 12 }}>
      <View
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
                "Interactive Pyraminx. Drag to rotate the view. Tap a tip to turn only that tip, or a center sticker to turn its main layer clockwise.",
                "交互金字塔。拖动改变视角，点击角尖仅转动该角尖，点击中心贴片以顺时针转动相应主层。",
              )
            : t(
                "Read-only Pyraminx. Drag to rotate the view.",
                "只读金字塔。拖动改变视角。",
              )
        }
        style={{
          height: 290,
          borderRadius: 24,
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
      {onTurn && !error && (
        <Txt small>
          {t(
            "Drag to rotate the view. Tap a tip for a tip turn or a center sticker for a main-layer turn. Edge stickers do not turn a layer.",
            "拖动改变视角。点击角尖转动角尖，点击中心贴片转动主层；点击棱块贴片不会转层。",
          )}
        </Txt>
      )}
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
    </View>
  );
}
