/**
 * `ScrollaThumbSlotProps`가 ARIA 소유 속성 8개(`role`/`tabIndex`/
 * `aria-controls`/`aria-valuenow`/`aria-valuemin`/`aria-valuemax`/`aria-orientation`/
 * `aria-hidden`)를 타입 레벨로 차단하고 `aria-label`/`aria-labelledby`/`aria-describedby`
 * 3개는 허용하며, track(`ScrollaVisualSlotProps`)에는 이 차단이 적용되지 않음을
 * `tsc --noEmit`으로 고정한다. 실행하지 않고 type-check만 한다. 일반 lint/test 대상에서는
 * `test/fixtures/**` 규칙과 `*.test.ts(x)` 아닌 파일명으로 자동 제외된다.
 *
 * TypeScript의 excess property check는 object literal 하나에 여러 excess key가 있으면
 * 첫 번째만 진단하고 나머지는 조용히 넘어간다(실측 확인). 그래서 8개를 한 object에 몰아넣지
 * 않고 각각 독립된 literal로 분리해 `@ts-expect-error`가 실제로 그 property 하나를 진단하는지
 * 개별 확인한다.
 */
import type {
  ScrollaThumbSlotProps,
  ScrollaVisualSlotProps,
} from "../../../src/index.js";

const blockedRole: ScrollaThumbSlotProps = {
  // @ts-expect-error thumb slot은 role을 타입 레벨로 차단한다(library-owned)
  role: "presentation",
};
void blockedRole;

const blockedTabIndex: ScrollaThumbSlotProps = {
  // @ts-expect-error thumb slot은 tabIndex를 타입 레벨로 차단한다(library-owned)
  tabIndex: 0,
};
void blockedTabIndex;

const blockedAriaControls: ScrollaThumbSlotProps = {
  // @ts-expect-error thumb slot은 aria-controls를 타입 레벨로 차단한다(library-owned)
  "aria-controls": "external-id",
};
void blockedAriaControls;

const blockedAriaValueNow: ScrollaThumbSlotProps = {
  // @ts-expect-error thumb slot은 aria-valuenow를 타입 레벨로 차단한다(library-owned)
  "aria-valuenow": 1,
};
void blockedAriaValueNow;

const blockedAriaValueMin: ScrollaThumbSlotProps = {
  // @ts-expect-error thumb slot은 aria-valuemin을 타입 레벨로 차단한다(library-owned)
  "aria-valuemin": 0,
};
void blockedAriaValueMin;

const blockedAriaValueMax: ScrollaThumbSlotProps = {
  // @ts-expect-error thumb slot은 aria-valuemax를 타입 레벨로 차단한다(library-owned)
  "aria-valuemax": 100,
};
void blockedAriaValueMax;

const blockedAriaOrientation: ScrollaThumbSlotProps = {
  // @ts-expect-error thumb slot은 aria-orientation을 타입 레벨로 차단한다(library-owned)
  "aria-orientation": "vertical",
};
void blockedAriaOrientation;

const blockedAriaHidden: ScrollaThumbSlotProps = {
  // @ts-expect-error thumb slot은 aria-hidden을 타입 레벨로 차단한다(library-owned)
  "aria-hidden": true,
};
void blockedAriaHidden;

const allowedThumbLabelProps: ScrollaThumbSlotProps = {
  "aria-label": "세로 스크롤",
  "aria-labelledby": "external-label-id",
  "aria-describedby": "external-desc-id",
};
void allowedThumbLabelProps;

const allowedTrackAriaProps: ScrollaVisualSlotProps = {
  role: "presentation",
  tabIndex: -1,
  "aria-hidden": true,
};
void allowedTrackAriaProps;
