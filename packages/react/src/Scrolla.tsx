import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type * as React from "react";
import { createScrollbarControllerRuntime } from "./core/index.js";
import type {
  ScrollbarControllerCreateOptions,
  ScrollbarControllerRuntime,
} from "./core/index.js";
import { composeEventHandlers, composeRefs } from "./slot-composition.js";
import type { ScrollaSlotProps } from "./slot-types.js";
import type {
  ScrollaAxis,
  ScrollaChangeMeta,
  ScrollaDirection,
  ScrollaHandle,
  ScrollaState,
  ScrollPosition,
} from "./value-types.js";

export interface ScrollaProps {
  children?: React.ReactNode;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  axis?: ScrollaAxis;
  direction?: ScrollaDirection;
  autoHide?: boolean;
  autoHideDelay?: number;
  scrollIdleDelay?: number;
  minThumbSize?: number;
  initialPosition?: Readonly<Partial<ScrollPosition>>;
  onStateChange?: (state: ScrollaState, meta: ScrollaChangeMeta) => void;
  slotProps?: ScrollaSlotProps;
}

const INITIAL_STATE: ScrollaState = {
  position: { x: 0, y: 0 },
  maxPosition: { x: 0, y: 0 },
  viewportSize: { width: 0, height: 0 },
  contentSize: { width: 0, height: 0 },
  overflow: { horizontal: false, vertical: false },
  scrolling: false,
  draggingAxis: null,
  visibility: "visible",
};

/** stable library class 뒤에 slot className, (있다면) component className을 순서대로 이어붙인다. */
function joinClassNames(...values: ReadonlyArray<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export const Scrolla = forwardRef<ScrollaHandle, ScrollaProps>(
  function Scrolla(props, ref) {
    const {
      children,
      id,
      className,
      style,
      axis = "both",
      direction = "auto",
      autoHide = false,
      autoHideDelay = 1000,
      scrollIdleDelay = 120,
      minThumbSize = 24,
      initialPosition,
      onStateChange,
      slotProps,
    } = props;

    const onStateChangeRef = useRef(onStateChange);
    useLayoutEffect(() => {
      onStateChangeRef.current = onStateChange;
    });

    const holderRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const trackVerticalRef = useRef<HTMLDivElement>(null);
    const thumbVerticalRef = useRef<HTMLDivElement>(null);
    const trackHorizontalRef = useRef<HTMLDivElement>(null);
    const thumbHorizontalRef = useRef<HTMLDivElement>(null);

    const runtimeRef = useRef<ScrollbarControllerRuntime | null>(null);
    const [state, setState] = useState<ScrollaState>(INITIAL_STATE);
    // unmount 뒤 getState()가 controller 없이도 마지막 snapshot을 반환할 수 있도록 별도로 보존한다.
    const stateRef = useRef<ScrollaState>(INITIAL_STATE);
    const [effectiveDirection, setEffectiveDirection] = useState<"ltr" | "rtl">(
      () => (direction === "auto" ? "ltr" : direction),
    );

    // useLayoutEffect는 mount 시 한 번만 읽으므로 이 ref는 첫 render 값으로 고정된다(재생성 없음).
    const initialOptionsRef = useRef<ScrollbarControllerCreateOptions>({
      axis,
      direction,
      autoHide,
      autoHideDelay,
      scrollIdleDelay,
      minThumbSize,
      initialPosition,
    });

    useLayoutEffect(() => {
      const holder = holderRef.current;
      const wrapper = wrapperRef.current;
      const scroller = scrollerRef.current;
      const content = contentRef.current;
      const trackVertical = trackVerticalRef.current;
      const thumbVertical = thumbVerticalRef.current;
      const trackHorizontal = trackHorizontalRef.current;
      const thumbHorizontal = thumbHorizontalRef.current;
      if (
        holder === null ||
        wrapper === null ||
        scroller === null ||
        content === null ||
        trackVertical === null ||
        thumbVertical === null ||
        trackHorizontal === null ||
        thumbHorizontal === null
      ) {
        return;
      }

      const runtime = createScrollbarControllerRuntime(
        {
          holder,
          wrapper,
          scroller,
          content,
          trackVertical,
          thumbVertical,
          trackHorizontal,
          thumbHorizontal,
        },
        initialOptionsRef.current,
      );
      runtimeRef.current = runtime;
      const { controller, ingress } = runtime;

      const onPointerEnter = () =>
        ingress.dispatch({ type: "holder-pointer-enter" });
      const onPointerLeave = () =>
        ingress.dispatch({ type: "holder-pointer-leave" });
      const onFocusIn = () => ingress.dispatch({ type: "holder-focus-in" });
      const onFocusOut = (event: FocusEvent) =>
        ingress.dispatch({ type: "holder-focus-out", event });
      holder.addEventListener("pointerenter", onPointerEnter);
      holder.addEventListener("pointerleave", onPointerLeave);
      holder.addEventListener("focusin", onFocusIn);
      holder.addEventListener("focusout", onFocusOut);

      const unsubscribe = controller.subscribe((nextState, meta) => {
        stateRef.current = nextState;
        setState(nextState);
        setEffectiveDirection(ingress.getEffectiveDirection());
        onStateChangeRef.current?.(nextState, meta);
      });

      // Strict Mode의 dev-only 이중 mount는 매번 재생성하고 destroy 멱등성에 맡긴다. 별도 guard를 두지 않는다.
      return () => {
        unsubscribe();
        holder.removeEventListener("pointerenter", onPointerEnter);
        holder.removeEventListener("pointerleave", onPointerLeave);
        holder.removeEventListener("focusin", onFocusIn);
        holder.removeEventListener("focusout", onFocusOut);
        runtimeRef.current = null;
        controller.destroy();
      };
    }, []);

    useLayoutEffect(() => {
      runtimeRef.current?.controller.updateOptions({
        axis,
        direction,
        autoHide,
        autoHideDelay,
        scrollIdleDelay,
        minThumbSize,
      });
    }, [
      axis,
      direction,
      autoHide,
      autoHideDelay,
      scrollIdleDelay,
      minThumbSize,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        refresh: () => runtimeRef.current?.controller.refresh(),
        scrollTo: (position) =>
          runtimeRef.current?.controller.scrollTo(position),
        scrollBy: (delta) => runtimeRef.current?.controller.scrollBy(delta),
        getState: () =>
          runtimeRef.current?.controller.getState() ?? stateRef.current,
      }),
      [],
    );

    const handleHolderPointerDownCapture = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        const runtime = runtimeRef.current;
        if (runtime === null) {
          return;
        }
        runtime.ingress.dispatch({
          type: "holder-pointer-down",
          event: event.nativeEvent,
        });
      },
      [],
    );

    const handleThumbVerticalKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const runtime = runtimeRef.current;
        if (runtime === null) {
          return;
        }
        runtime.ingress.dispatch({
          type: "thumb-key-down",
          axis: "vertical",
          event: event.nativeEvent,
        });
      },
      [],
    );
    const handleThumbHorizontalKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const runtime = runtimeRef.current;
        if (runtime === null) {
          return;
        }
        runtime.ingress.dispatch({
          type: "thumb-key-down",
          axis: "horizontal",
          event: event.nativeEvent,
        });
      },
      [],
    );

    const composedHolderRef = useMemo(
      () => composeRefs(holderRef, slotProps?.holder?.ref),
      [slotProps?.holder?.ref],
    );
    const composedWrapperRef = useMemo(
      () => composeRefs(wrapperRef, slotProps?.wrapper?.ref),
      [slotProps?.wrapper?.ref],
    );
    const composedScrollerRef = useMemo(
      () => composeRefs(scrollerRef, slotProps?.scroller?.ref),
      [slotProps?.scroller?.ref],
    );
    const composedContentRef = useMemo(
      () => composeRefs(contentRef, slotProps?.content?.ref),
      [slotProps?.content?.ref],
    );
    const composedTrackVerticalRef = useMemo(
      () => composeRefs(trackVerticalRef, slotProps?.trackVertical?.ref),
      [slotProps?.trackVertical?.ref],
    );
    const composedThumbVerticalRef = useMemo(
      () => composeRefs(thumbVerticalRef, slotProps?.thumbVertical?.ref),
      [slotProps?.thumbVertical?.ref],
    );
    const composedTrackHorizontalRef = useMemo(
      () => composeRefs(trackHorizontalRef, slotProps?.trackHorizontal?.ref),
      [slotProps?.trackHorizontal?.ref],
    );
    const composedThumbHorizontalRef = useMemo(
      () => composeRefs(thumbHorizontalRef, slotProps?.thumbHorizontal?.ref),
      [slotProps?.thumbHorizontal?.ref],
    );

    // 계약 "ARIA와 focus"의 blur는 core controller runtime이 소유한다(core 분리 판정 기준).
    const verticalActive = axis !== "horizontal" && state.overflow.vertical;
    const horizontalActive = axis !== "vertical" && state.overflow.horizontal;

    const generatedScrollerId = useId();
    const scrollerId = slotProps?.scroller?.id ?? generatedScrollerId;
    const verticalLabel =
      slotProps?.thumbVertical?.["aria-label"] ??
      (slotProps?.thumbVertical?.["aria-labelledby"]
        ? undefined
        : "Vertical scrollbar");
    const horizontalLabel =
      slotProps?.thumbHorizontal?.["aria-label"] ??
      (slotProps?.thumbHorizontal?.["aria-labelledby"]
        ? undefined
        : "Horizontal scrollbar");

    return (
      <div
        {...slotProps?.holder}
        ref={composedHolderRef}
        id={id ?? slotProps?.holder?.id}
        className={joinClassNames(
          "scrolla",
          slotProps?.holder?.className,
          className,
        )}
        style={{
          ...slotProps?.holder?.style,
          ...style,
          ...(direction === "auto" ? undefined : { direction }),
        }}
        data-axis={axis}
        data-direction={effectiveDirection}
        data-overflow-horizontal={state.overflow.horizontal ? "" : undefined}
        data-overflow-vertical={state.overflow.vertical ? "" : undefined}
        data-scrolling={state.scrolling ? "" : undefined}
        data-dragging={state.draggingAxis ?? undefined}
        data-visibility={state.visibility}
        onPointerDownCapture={composeEventHandlers(
          slotProps?.holder?.onPointerDownCapture,
          handleHolderPointerDownCapture,
        )}
      >
        <div
          {...slotProps?.wrapper}
          ref={composedWrapperRef}
          className={joinClassNames(
            "scrolla__wrapper",
            slotProps?.wrapper?.className,
          )}
        >
          <div
            {...slotProps?.scroller}
            ref={composedScrollerRef}
            id={scrollerId}
            className={joinClassNames(
              "scrolla__scroller",
              slotProps?.scroller?.className,
            )}
          >
            <div
              {...slotProps?.content}
              ref={composedContentRef}
              className={joinClassNames(
                "scrolla__content",
                slotProps?.content?.className,
              )}
            >
              {children}
            </div>
          </div>
        </div>
        <div
          {...slotProps?.trackVertical}
          ref={composedTrackVerticalRef}
          className={joinClassNames(
            "scrolla__track scrolla__track--vertical",
            slotProps?.trackVertical?.className,
          )}
        >
          <div
            {...slotProps?.thumbVertical}
            ref={composedThumbVerticalRef}
            className={joinClassNames(
              "scrolla__thumb scrolla__thumb--vertical",
              slotProps?.thumbVertical?.className,
            )}
            role="scrollbar"
            aria-orientation="vertical"
            aria-label={verticalLabel}
            aria-controls={scrollerId}
            aria-valuemin={0}
            aria-valuemax={state.maxPosition.y}
            aria-valuenow={state.position.y}
            tabIndex={verticalActive ? 0 : -1}
            aria-hidden={verticalActive ? undefined : "true"}
            onKeyDown={composeEventHandlers(
              slotProps?.thumbVertical?.onKeyDown,
              handleThumbVerticalKeyDown,
            )}
          />
        </div>
        <div
          {...slotProps?.trackHorizontal}
          ref={composedTrackHorizontalRef}
          className={joinClassNames(
            "scrolla__track scrolla__track--horizontal",
            slotProps?.trackHorizontal?.className,
          )}
        >
          <div
            {...slotProps?.thumbHorizontal}
            ref={composedThumbHorizontalRef}
            className={joinClassNames(
              "scrolla__thumb scrolla__thumb--horizontal",
              slotProps?.thumbHorizontal?.className,
            )}
            role="scrollbar"
            aria-orientation="horizontal"
            aria-label={horizontalLabel}
            aria-controls={scrollerId}
            aria-valuemin={0}
            aria-valuemax={state.maxPosition.x}
            aria-valuenow={state.position.x}
            tabIndex={horizontalActive ? 0 : -1}
            aria-hidden={horizontalActive ? undefined : "true"}
            onKeyDown={composeEventHandlers(
              slotProps?.thumbHorizontal?.onKeyDown,
              handleThumbHorizontalKeyDown,
            )}
          />
        </div>
      </div>
    );
  },
);
