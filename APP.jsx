import { useState, useEffect } from "react";

// ============================================================
// 서버 연동 설정
// 로그인/회원가입은 회원가입팀 서버, 홈/설정(예측) 화면은 별도의 서버로 나뉘어 있어
// 두 개의 API 주소를 따로 둡니다.
// ============================================================
const AUTH_API_BASE_URL = "http://192.168.0.12:8001"; // 로그인/회원가입 API
const HOME_API_BASE_URL = "http://192.168.0.12:8000"; // 홈/설정(예측) API
// 백엔드 서버가 꺼져 있어 프론트만으로 화면을 테스트할 때는 true로 두세요.
// 백엔드 팀이 서버를 켜서 실제 API와 연결할 준비가 되면 false로 바꾸면 됩니다.
const USE_MOCK = false;

function mockDelay(result, ms = 500) {
  return new Promise((resolve) => setTimeout(() => resolve(result), ms));
}

// 목업 모드에서 회원가입 없이 바로 로그인해볼 수 있는 임시 테스트 계정입니다.
// (백엔드 연결 전까지만 쓰는 값이라 화면에는 노출하지 않았어요.)
const TEST_ACCOUNT = { id: "test1234", password: "test1234" };

// 목업 모드에서 회원가입한 계정도 같은 세션 안에서는 로그인되도록 기억해둡니다.
// (새로고침하면 사라지는 임시 저장소이고, 실제 서버가 붙으면 이 배열은 쓰이지 않습니다.)
const mockSignedUpAccounts = [];

// 아이디 중복 확인: GET /api/members/check-id?id=xxx (로그인 API)
async function checkIdDuplicateApi(id) {
  if (USE_MOCK) {
    const taken = ["admin", "test", TEST_ACCOUNT.id, ...mockSignedUpAccounts.map((a) => a.id)];
    return mockDelay({ available: !taken.includes(id) });
  }
  const res = await fetch(`${AUTH_API_BASE_URL}/api/members/check-id?id=${encodeURIComponent(id)}`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("아이디 중복 확인에 실패했습니다.");
  return res.json(); // { available: boolean }
}

// 회원가입: POST /api/members/signup (로그인 API)
async function signupApi(payload) {
  if (USE_MOCK) {
    mockSignedUpAccounts.push({ id: payload.id, password: payload.password });
    return mockDelay({ success: true });
  }
  const res = await fetch(`${AUTH_API_BASE_URL}/api/members/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "회원가입에 실패했습니다.");
  }
  return res.json();
}

// 로그인: POST /api/auth/login (로그인 API)
// 응답에 담긴 토큰을 꺼내서 이후 홈/설정 API 호출 시 Authorization: Bearer 로 사용합니다.
async function loginApi({ id, password }) {
  if (USE_MOCK) {
    const known = [TEST_ACCOUNT, ...mockSignedUpAccounts];
    const matched = known.some((a) => a.id === id && a.password === password);
    return mockDelay({ success: matched, id, token: matched ? "mock-token" : null });
  }
  const res = await fetch(`${AUTH_API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, password }),
  });
  if (!res.ok) {
    return { success: false };
  }
  const data = await res.json(); // { success: boolean, token(또는 access_token): string, ... }
  const token = data.token || data.access_token || data.accessToken || null;
  return { ...data, success: true, token };
}

// 홈 화면 데이터: GET /home (홈/설정 API, Authorization: Bearer 토큰 필요)
// 응답: { nickname, blood_type, rh_type, next_donation_dday, predicted_dates,
//         predicted_volumes, current_status, ai_comment, risk_probability, next_status }
async function fetchHomeApi(token) {
  if (USE_MOCK) {
    return mockDelay(
      {
        nickname: "테스트",
        blood_type: "A",
        rh_type: "Rh+",
        next_donation_dday: "D-7",
        predicted_dates: ["오늘", "8.3", "8.8", "8.13", "8.18"],
        predicted_volumes: [10229, 13000, 15000, 8000, 4000],
        current_status: "안정",
        ai_comment: "현재 혈액 보유량은 안정적입니다.",
        risk_probability: 43,
        next_status: "경계",
      },
      300
    );
  }
  const res = await fetch(`${HOME_API_BASE_URL}/home`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("홈 화면 데이터를 불러오지 못했습니다.");
  return res.json();
}

// 설정 화면 조회: GET /settings (홈/설정 API, Authorization: Bearer 토큰 필요)
async function fetchSettingsApi(token) {
  if (USE_MOCK) {
    return mockDelay({ notification_enabled: true, sensitivity: "보통", frequency: "1", resend_count: 3 }, 300);
  }
  const res = await fetch(`${HOME_API_BASE_URL}/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("설정 정보를 불러오지 못했습니다.");
  return res.json();
}

// 설정 변경: PATCH /settings/{path} (홈/설정 API)
async function patchSettingsApi(token, path, body) {
  if (USE_MOCK) {
    return mockDelay({ notification_enabled: true, sensitivity: "보통", frequency: "1", resend_count: 3, ...body }, 200);
  }
  const res = await fetch(`${HOME_API_BASE_URL}/settings/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("설정 변경에 실패했습니다.");
  return res.json();
}

const updateNotificationApi = (token, notification_enabled) =>
  patchSettingsApi(token, "notification", { notification_enabled });
const updateSensitivityApi = (token, sensitivity) => patchSettingsApi(token, "sensitivity", { sensitivity });
const updateFrequencyApi = (token, frequency) => patchSettingsApi(token, "frequency", { frequency });
const updateResendCountApi = (token, resend_count) => patchSettingsApi(token, "resend-count", { resend_count });

// ---------- 디자인 토큰 ----------
const RED = "#e53e3e";
const BLACK = "#161616";
const GREY_BG = "#f4f4f5";
const BORDER = "#e2e2e5";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  fontSize: 15,
  outline: "none",
  marginBottom: 12,
  background: "#fff",
  color: BLACK,
  colorScheme: "light",
};

// 버튼 두께/크기를 화면마다 다르게 주지 않고 이 값 하나로 통일합니다.
// (옵션 버튼, "다음" 버튼 모두 이 padding을 그대로 써서 두께가 똑같아지도록 합니다.)
// 와이어프레임의 버튼은 카드처럼 둥글지 않고 거의 각진 모서리라 radius를 작게 둡니다.
const buttonBase = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 20px",
  borderRadius: 6,
  border: "none",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  transition: "opacity .15s ease, transform .05s ease",
};

const primaryBtn = { ...buttonBase, background: BLACK, color: "#fff" };
const disabledBtn = { ...buttonBase, background: "#d8d8db", color: "#fff", cursor: "not-allowed" };

// 화면 하단에 "다음" 버튼을 고정하는 영역(화면마다 버튼 위치/두께가 달라지지 않도록 공통으로 사용)
const footerStyle = { padding: "16px 20px 20px", flexShrink: 0 };

// 질문 문구 뒤에 까는 연한 회색 카드(화면 끝까지 꽉 채우지 않고 양옆에 살짝 여백을 둡니다)
const questionBandStyle = {
  background: GREY_BG,
  borderRadius: 14,
  margin: "26px 14px 0",
  padding: "18px 16px",
  flexShrink: 0,
};

// 날짜 선택용 옵션들 (매 렌더마다 새로 만들 필요 없는 고정값)
const YEARS = Array.from({ length: 80 }, (_, i) => 2026 - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// 헌혈 가능 나이(만 나이) 범위
const MIN_AGE = 16;
const MAX_AGE = 60;

// 회원 정보 수정 화면 참고 이미지에는 상한이 만 69세로 되어 있어 회원가입(MAX_AGE=60)과 다릅니다.
// 실수인지 의도한 값인지 확인이 필요해서 우선 이 화면에서만 이 값을 그대로 반영했습니다.
const EDIT_PROFILE_MAX_AGE = 69;

// 비밀번호 규칙: 영문, 숫자 조합으로 8글자 이상
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*[0-9]).{8,}$/;

// 날짜 객체 -> "YYYY-MM-DD" 문자열
const toDateString = (o) =>
  `${o.year}-${String(o.month).padStart(2, "0")}-${String(o.day).padStart(2, "0")}`;

// 월마다 실제 일수가 다르므로(1월 31일, 2월 28/29일 등) 항상 이 함수로 계산합니다.
// month: 1~12
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// 생년월일 -> 만 나이 (아직 생일이 지나지 않았으면 1살 덜 계산)
function calcAge(birthDate, today) {
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthdayThisYear =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

function addDaysToDateString(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}

function Header({ title, onBack, right }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "16px",
        background: GREY_BG,
        position: "relative",
        flexShrink: 0,
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          style={{
            position: "absolute",
            left: 16,
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            color: BLACK,
          }}
          aria-label="뒤로가기"
        >
          ←
        </button>
      )}
      <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 16 }}>{title}</div>
      {right && <div style={{ position: "absolute", right: 16 }}>{right}</div>}
    </div>
  );
}

// value/onChange는 숫자로 다루지만, 아직 아무것도 고르지 않은 초기 상태는 빈 문자열("")로 표현합니다.
// placeholder를 주면 "연도 선택"처럼 안내 문구가 있는 선택되지 않은 옵션을 맨 위에 추가합니다.
// stringValue를 true로 주면 값을 숫자로 바꾸지 않고 문자열 그대로 넘깁니다.
// (연도/월/일처럼 숫자 옵션이 아니라 "A"/"Rh+"/"전혈"처럼 글자 옵션을 다룰 때 사용합니다.)
function SelectRow({ label, value, options, placeholder, onChange, stringValue }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange("");
          } else {
            onChange(stringValue ? raw : Number(raw));
          }
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${BORDER}`,
          fontSize: 15,
          background: "#fff",
          color: BLACK,
          colorScheme: "light",
        }}
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o} value={o} style={{ color: BLACK, background: "#fff" }}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// 선택된 항목은 배경색을 바꾸는 대신 오른쪽에 "CHECK" 표시를 붙입니다.
function OptionButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...buttonBase,
        marginBottom: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        textAlign: "left",
        background: BLACK,
        color: "#fff",
      }}
    >
      <span>{children}</span>
      {active && <span style={{ fontSize: 11, fontWeight: 700, color: "#b7b7bd", letterSpacing: 0.5 }}>CHECK</span>}
    </button>
  );
}

// 조건에 맞지 않을 때 띄우는 안내창 (예: 나이 제한, 입력값 검증 등)
// title: 일반 입력 검증은 "주의", 나이 제한처럼 더 강한 경고는 "경고"를 사용합니다.
// onCancel을 넘기면 "아니오/예"처럼 취소 버튼이 있는 확인창이 되고,
// 넘기지 않으면 기존처럼 확인 버튼 하나짜리 안내창이 됩니다.
function AlertDialog({ title = "주의", message, confirmText = "확인", onConfirm, cancelText, onCancel }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 280,
          background: "#fff",
          borderRadius: 14,
          padding: "18px 20px",
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: BLACK }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 16, whiteSpace: "pre-line", color: "#333" }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{
                background: "#fff",
                color: BLACK,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {cancelText || "아니오"}
            </button>
          )}
          <button
            onClick={onConfirm}
            style={{
              background: BLACK,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- 화면들 ----------
// 아래 화면 컴포넌트들은 App() 내부가 아니라 모듈 최상위에서 정의합니다.
// App 내부에 정의하면 App이 리렌더링될 때마다(예: 글자 하나 입력할 때마다)
// 새 컴포넌트로 취급되어 DOM(특히 input)이 매번 재생성되고 포커스가 끊깁니다.

function Splash() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <svg width="90" height="90" viewBox="0 0 100 100">
        <path d="M50 6 C50 6 20 46 20 66 A30 30 0 0 0 80 66 C80 46 50 6 50 6 Z" fill={RED} />
        {/* 하트 리본(가운데로 붉은 배경이 비침) + 하트 아래쪽 꼬리가 물방울 밖으로 흘러나오는 모양 */}
        <path
          d="M48 50
             C 48 45, 41 41, 34 41
             C 26 41, 21 47, 21 54
             C 21 62, 31 68, 48 78
             C 65 68, 75 62, 75 54
             C 75 47, 70 41, 62 41
             C 55 41, 48 45, 48 50 Z"
          fill="none"
          stroke="#fff"
          strokeWidth="6.5"
          strokeLinejoin="round"
        />
        <path
          d="M49 78 C 47 87, 40 92, 27 92 C 22 92, 19 90.5, 17 88"
          fill="none"
          stroke="#fff"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
      </svg>
      <div style={{ marginTop: 14, fontWeight: 800, fontSize: 20, letterSpacing: 1 }}>BLOOD LINK</div>
    </div>
  );
}

function SignupCard({ title, onSelect }) {
  return (
    <div style={{ border: `1.5px solid ${BLACK}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
        {/* 실제 이미지가 들어가기 전 자리표시용 아이콘 (와이어프레임의 이미지 placeholder) */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 10,
            background: GREY_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="2.6" fill="#b4b4bb" />
            <path d="M3 18 L9.5 10.5 L14 15.5 L17 12 L21 18 Z" fill="#b4b4bb" />
          </svg>
        </div>
      </div>
      <button
        style={{ ...primaryBtn, width: "auto", padding: "12px 22px", display: "inline-flex", alignItems: "center", gap: 8 }}
        onClick={onSelect}
      >
        가입하기
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

// 회원가입 시작 화면. "가입하기"를 누르면 별도 화면으로 넘어가지 않고,
// 이 화면 위로 개인정보 동의 시트가 아래에서 위로 슬라이드되어 올라옵니다.
function SignupSelect({ setScreen }) {
  const [showAgree, setShowAgree] = useState(false);
  const [showDisagree, setShowDisagree] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 12 }}>헌혈은 사랑입니다</div>
        <div style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>블러드 링크에 오신 것을 환영합니다</div>
        <div style={{ color: "#888", fontSize: 13, marginBottom: 24 }}>
          회원구분에 따라 가입 절차에 차이가 있으니 본인이 해당하는 경우를 선택하여 주십시오
        </div>
        <div style={{ color: BLACK, fontSize: 13, textAlign: "center", margin: "0 0 32px" }}>
          헌혈은 만 16세부터 참여가 가능합니다.
        </div>
        <SignupCard title="만 16세 이상 가입하기" onSelect={() => setShowAgree(true)} />
      </div>

      {showAgree && (
        <>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.28)", zIndex: 40 }}
            onClick={() => setShowAgree(false)}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              padding: "14px 20px 24px",
              boxShadow: "0 -12px 32px rgba(0,0,0,0.15)",
              zIndex: 41,
              animation: "sheetSlideUp .25s ease-out",
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: BORDER, margin: "0 auto 20px" }} />
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.6, marginBottom: 8 }}>
              사용자님의 회원가입을 진행하기 위해서는
              <br />
              회원 정보가 필요해요
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>필수 : 개인정보 수집/이용 동의</div>
            <button
              style={{ ...primaryBtn, marginBottom: 12 }}
              onClick={() => {
                setShowAgree(false);
                setScreen("nickname");
              }}
            >
              동의
            </button>
            <button style={primaryBtn} onClick={() => setShowDisagree(true)}>
              비동의
            </button>
          </div>
        </>
      )}

      {showDisagree && (
        <AlertDialog
          message="개인정보 수집/이용 동의가 이루어지지 않을 경우 서비스 이용이 어렵습니다."
          onConfirm={() => setShowDisagree(false)}
        />
      )}
    </div>
  );
}

function BloodNormal({ normalBlood, setNormalBlood, storage, setStorage, setScreen }) {
  const opts = ["A", "B", "O", "AB"];
  const [showMissing, setShowMissing] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={questionBandStyle}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{storage.nickname}님</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>혈액형은 무엇인가요?</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {opts.map((o) => (
          <OptionButton key={o} active={normalBlood === o} onClick={() => setNormalBlood(o)}>
            {o}
          </OptionButton>
        ))}
      </div>
      <div style={footerStyle}>
        <button
          style={primaryBtn}
          onClick={() => {
            if (!normalBlood) {
              setShowMissing(true);
              return;
            }
            // 혈액형(A/B/O/AB)을 storage에 저장 (Rh는 다음 화면에서 별도로 저장)
            setStorage((s) => ({ ...s, bloodType: normalBlood }));
            setScreen("bloodRh");
          }}
        >
          다음
        </button>
      </div>

      {showMissing && (
        // 확인을 누르면 값을 채울 수 있도록 같은 화면에 그대로 머무릅니다.
        <AlertDialog message="정보를 입력해주세요." onConfirm={() => setShowMissing(false)} />
      )}
    </div>
  );
}

function BloodRh({ rhType, setRhType, storage, setStorage, setScreen }) {
  const opts = ["Rh+", "Rh-", "모름"];
  const [showMissing, setShowMissing] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={questionBandStyle}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{storage.nickname}님</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Rh형은 무엇인가요?</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {opts.map((o) => (
          <OptionButton key={o} active={rhType === o} onClick={() => setRhType(o)}>
            {o}
          </OptionButton>
        ))}
      </div>
      <div style={footerStyle}>
        <button
          style={primaryBtn}
          onClick={() => {
            if (!rhType) {
              setShowMissing(true);
              return;
            }
            // 혈액형과 Rh형을 각각 별도의 문자열로 저장
            setStorage((s) => ({ ...s, rhType }));
            setScreen("birthdate");
          }}
        >
          다음
        </button>
      </div>

      {showMissing && (
        <AlertDialog message="정보를 입력해주세요." onConfirm={() => setShowMissing(false)} />
      )}
    </div>
  );
}

function Birthdate({ birth, setBirth, storage, setStorage, setScreen }) {
  const [ageError, setAgeError] = useState(""); // 나이 제한 안내 문구
  const [showMissing, setShowMissing] = useState(false);

  const hasYear = birth.year !== "";
  const hasMonth = birth.month !== "";

  // 월마다 실제 일수가 다르므로(1월 31일, 2월 28/29일 등) 선택된 연/월 기준으로
  // 일(day) 드롭다운 옵션을 동적으로 계산합니다. 아직 연/월을 고르지 않았으면 31일까지 보여줍니다.
  const maxDay = hasYear && hasMonth ? daysInMonth(birth.year, birth.month) : 31;
  const dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);

  // 연도/월을 바꿔서 최대 일수가 줄어들면(예: 31일 -> 2월로 변경) 현재 선택된 일을
  // 그 달의 마지막 날로 맞춰줍니다.
  function updateYear(year) {
    setBirth((b) => ({ ...b, year, day: b.day === "" || !b.month ? b.day : Math.min(b.day, daysInMonth(year, b.month)) }));
  }
  function updateMonth(month) {
    setBirth((b) => ({ ...b, month, day: b.day === "" || !b.year ? b.day : Math.min(b.day, daysInMonth(b.year, month)) }));
  }

  function handleNext() {
    if (birth.year === "" || birth.month === "" || birth.day === "") {
      setShowMissing(true);
      return;
    }
    const birthDate = new Date(birth.year, birth.month - 1, birth.day);
    const age = calcAge(birthDate, new Date());
    if (age < MIN_AGE) {
      setAgeError(`만 ${MIN_AGE}세 미만은 회원가입을 할 수 없습니다.\n(입력하신 생년월일 기준 만 ${age}세)`);
      return;
    }
    if (age > MAX_AGE) {
      setAgeError(`만 ${MAX_AGE}세를 초과하면 회원가입을 할 수 없습니다.\n(입력하신 생년월일 기준 만 ${age}세)`);
      return;
    }

    // 생년월일을 "YYYY-MM-DD" 문자열로 저장
    setStorage((s) => ({ ...s, birthdate: toDateString(birth) }));
    setScreen("donationDate");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={questionBandStyle}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{storage.nickname}님</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>생년월일을 입력해주세요.</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <SelectRow label="연도" value={birth.year} options={YEARS} placeholder="연도 선택" onChange={updateYear} />
        <SelectRow label="월" value={birth.month} options={MONTHS} placeholder="월 선택" onChange={updateMonth} />
        <SelectRow label="일" value={birth.day} options={dayOptions} placeholder="일 선택" onChange={(v) => setBirth((b) => ({ ...b, day: v }))} />
      </div>
      <div style={footerStyle}>
        <button style={primaryBtn} onClick={handleNext}>
          다음
        </button>
      </div>

      {showMissing && (
        <AlertDialog message="정보를 입력해주세요." onConfirm={() => setShowMissing(false)} />
      )}
      {ageError && (
        // 확인을 누르면 이전 화면으로 돌아가지 않고, 생년월일을 다시 고칠 수 있도록 같은 화면에 머무릅니다.
        <AlertDialog title="경고" message={ageError} onConfirm={() => setAgeError("")} />
      )}
    </div>
  );
}

function DonationDate({ donation, setDonation, noHistory, setNoHistory, storage, setStorage, setScreen }) {
  const [showMissing, setShowMissing] = useState(false);
  const hasYear = donation.year !== "";
  const hasMonth = donation.month !== "";

  // 월마다 실제 일수가 다르므로(1월 31일, 2월 28/29일 등) 선택된 연/월 기준으로
  // 일(day) 옵션을 동적으로 계산합니다. 아직 연/월을 고르지 않았으면 31일까지 보여줍니다.
  const maxDay = hasYear && hasMonth ? daysInMonth(donation.year, donation.month) : 31;
  const dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);

  // 연도/월을 바꿔서 최대 일수가 줄어들면(예: 31일 -> 2월로 변경) 현재 선택된 일을
  // 그 달의 마지막 날로 맞춰줍니다.
  function updateYear(year) {
    setDonation((d) => ({ ...d, year, day: d.day === "" || !d.month ? d.day : Math.min(d.day, daysInMonth(year, d.month)) }));
  }
  function updateMonth(month) {
    setDonation((d) => ({ ...d, month, day: d.day === "" || !d.year ? d.day : Math.min(d.day, daysInMonth(d.year, month)) }));
  }

  function handleNext() {
    if (!noHistory && (donation.year === "" || donation.month === "" || donation.day === "")) {
      setShowMissing(true);
      return;
    }
    // 헌혈 날짜를 "YYYY-MM-DD" 문자열로 저장, 내역 없으면 null
    setStorage((s) => ({ ...s, donationDate: noHistory ? null : toDateString(donation) }));
    setScreen("donationMethod");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={questionBandStyle}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{storage.nickname}님</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>최근 헌혈 날짜를 입력해주세요.</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ opacity: noHistory ? 0.4 : 1, pointerEvents: noHistory ? "none" : "auto" }}>
          <SelectRow label="연도" value={donation.year} options={YEARS} placeholder="연도 선택" onChange={updateYear} />
          <SelectRow label="월" value={donation.month} options={MONTHS} placeholder="월 선택" onChange={updateMonth} />
          <SelectRow label="일" value={donation.day} options={dayOptions} placeholder="일 선택" onChange={(v) => setDonation((d) => ({ ...d, day: v }))} />
        </div>
        <button
          onClick={() => setNoHistory((v) => !v)}
          style={{
            ...buttonBase,
            background: BLACK,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>헌혈 내역 없음</span>
          {noHistory && <span style={{ fontSize: 11, fontWeight: 700, color: "#b7b7bd", letterSpacing: 0.5 }}>CHECK</span>}
        </button>
      </div>
      <div style={footerStyle}>
        <button style={primaryBtn} onClick={handleNext}>
          다음
        </button>
      </div>

      {showMissing && (
        <AlertDialog message="정보를 입력해주세요." onConfirm={() => setShowMissing(false)} />
      )}
    </div>
  );
}

function DonationMethod({ method, setMethod, storage, setStorage, setScreen }) {
  const mainOpts = ["전혈", "혈소판성분헌혈", "혈장성분헌혈", "혈소판혈장성분헌혈"];
  const isUnknown = method === "모름";
  const selectValue = method && mainOpts.includes(method) ? method : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={questionBandStyle}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{storage.nickname}님</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>최근 헌혈 방식을 입력해주세요.</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ position: "relative", marginBottom: 16 }}>
          <select
            value={selectValue}
            onChange={(e) => setMethod(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 16px",
              borderRadius: 10,
              border: `1px solid ${BORDER}`,
              fontSize: 15,
              background: "#fff",
              color: BLACK,
              colorScheme: "light",
              appearance: "none",
            }}
          >
            <option value="" disabled hidden>
              헌혈 방식을 선택해주세요
            </option>
            {mainOpts.map((o) => (
              <option key={o} value={o} style={{ color: BLACK, background: "#fff" }}>
                {o}
              </option>
            ))}
          </select>
          <span
            style={{
              position: "absolute",
              right: 16,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "#888",
            }}
          >
            ▾
          </span>
        </div>
        <button
          onClick={() => setMethod("모름")}
          style={{
            ...buttonBase,
            background: BLACK,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>헌혈 방식 모름</span>
          {isUnknown && <span style={{ fontSize: 11, fontWeight: 700, color: "#b7b7bd", letterSpacing: 0.5 }}>CHECK</span>}
        </button>
      </div>
      <div style={footerStyle}>
        <button
          style={method ? primaryBtn : disabledBtn}
          disabled={!method}
          onClick={() => {
            // 헌혈 방식을 문자열로 저장
            setStorage((s) => ({ ...s, donationMethod: method }));
            setScreen("idPwSignup");
          }}
        >
          다음
        </button>
      </div>
    </div>
  );
}

function Nickname({ nickname, setNickname, setStorage, setScreen }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={questionBandStyle}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>사용자님</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>닉네임을 입력해주세요.</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <input
          style={inputStyle}
          placeholder="닉네임"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
        />
        <div style={{ fontSize: 12, color: "#888" }}>최대 12자까지 입력할 수 있어요</div>
      </div>
      <div style={footerStyle}>
        <button
          style={nickname.trim() ? primaryBtn : disabledBtn}
          disabled={!nickname.trim()}
          onClick={() => {
            // 닉네임을 문자열로 저장
            setStorage((s) => ({ ...s, nickname: nickname.trim() }));
            setScreen("bloodNormal");
          }}
        >
          다음
        </button>
      </div>
    </div>
  );
}

function IdPwSignup({
  newId,
  setNewId,
  idChecked,
  setIdChecked,
  idChecking,
  setIdChecking,
  newPw,
  setNewPw,
  newPwConfirm,
  setNewPwConfirm,
  showPw,
  setShowPw,
  showPwConfirm,
  setShowPwConfirm,
  signupError,
  setSignupError,
  signingUp,
  setSigningUp,
  storage,
  setStorage,
  setScreen,
}) {
  const canSubmit = idChecked && newId && newPw && newPw === newPwConfirm && !signingUp;

  // 아이디 중복 확인 결과 / 비밀번호 형식·일치 여부는 팝업이 아니라 입력창 아래
  // 문구로 바로 보여줍니다. (validationError는 "다음" 클릭 시 종합 검증 실패 팝업 전용)
  const [idCheckMessage, setIdCheckMessage] = useState("");
  const passwordFormatValid = PASSWORD_RULE.test(newPw);
  const [validationError, setValidationError] = useState("");

  async function handleCheckDuplicate() {
    if (!newId || idChecking) return;
    setIdChecking(true);
    setSignupError("");
    setIdCheckMessage("");
    try {
      const res = await checkIdDuplicateApi(newId);
      if (res.available) {
        setIdChecked(true);
        setIdCheckMessage("사용 가능한 아이디입니다.");
      } else {
        setIdChecked(false);
        setIdCheckMessage("이미 사용중인 아이디입니다.");
      }
    } catch (e) {
      setSignupError(e.message || "아이디 중복 확인 중 오류가 발생했습니다.");
    } finally {
      setIdChecking(false);
    }
  }

  function handleSubmit() {
    if (signingUp) return;
    if (!newId || !newPw || !newPwConfirm) {
      setValidationError("정보를 입력해주세요.");
      return;
    }
    if (!idChecked) {
      setValidationError(idCheckMessage === "이미 사용중인 아이디입니다." ? idCheckMessage : "아이디 중복 확인을 해주세요.");
      return;
    }
    if (!passwordFormatValid) {
      setValidationError("비밀번호는 영문, 숫자 조합으로 8글자 이상이어야 합니다.");
      return;
    }
    if (newPw !== newPwConfirm) {
      setValidationError("비밀번호가 일치하지 않습니다.");
      return;
    }
    submit();
  }

  async function submit() {
    setSigningUp(true);
    setSignupError("");
    // 회원가입 버튼을 누른 시점에 아이디/비밀번호를 storage에 확정 저장
    // (서버 응답과 무관하게 로컬에 입력한 값을 바로 확정한다)
    setStorage((s) => ({ ...s, id: newId, password: newPw }));
    // 서버로 보낼 최종 요청 바디 (요청 형식에 맞춰 각 항목을 개별 필드로 전송)
    const payload = {
      nickname: storage.nickname,
      bloodType: storage.bloodType, // "A" | "B" | "O" | "AB"
      rhType: storage.rhType, // "Rh+" | "Rh-" | "모름"
      birthdate: storage.birthdate, // "YYYY-MM-DD"
      donationDate: storage.donationDate, // "YYYY-MM-DD" | null
      donationMethod: storage.donationMethod,
      id: newId,
      password: newPw,
    };
    try {
      await signupApi(payload);
      setSigningUp(false);
      setScreen("login");
    } catch (e) {
      setSigningUp(false);
      setSignupError(e.message || "회원가입 요청 중 오류가 발생했습니다.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={questionBandStyle}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{storage.nickname}님</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>회원 정보를 입력해주세요.</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: idCheckMessage ? 4 : 12 }}>
          <input
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
            placeholder="아이디"
            value={newId}
            onChange={(e) => {
              setNewId(e.target.value);
              setIdChecked(false);
              setSignupError("");
              setIdCheckMessage("");
            }}
          />
          <button
            style={{ ...primaryBtn, width: "auto", padding: "0 18px", whiteSpace: "nowrap" }}
            onClick={handleCheckDuplicate}
            disabled={idChecking}
          >
            {idChecking ? "확인 중..." : "중복 확인"}
          </button>
        </div>
        {idCheckMessage && (
          <div style={{ fontSize: 12, color: idChecked ? "#555" : RED, marginBottom: 16 }}>{idCheckMessage}</div>
        )}
        <div style={{ position: "relative" }}>
          <input
            style={inputStyle}
            type={showPw ? "text" : "password"}
            placeholder="비밀번호"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <span onClick={() => setShowPw((v) => !v)} style={{ position: "absolute", right: 16, top: 14, cursor: "pointer" }}>
            👁
          </span>
        </div>
        {newPw && !passwordFormatValid && (
          <div style={{ fontSize: 12, color: RED, marginTop: -8, marginBottom: 12 }}>
            비밀번호는 영문, 숫자 조합으로 8글자 이상이어야 합니다.
          </div>
        )}
        <div style={{ position: "relative" }}>
          <input
            style={inputStyle}
            type={showPwConfirm ? "text" : "password"}
            placeholder="비밀번호 확인"
            value={newPwConfirm}
            onChange={(e) => setNewPwConfirm(e.target.value)}
          />
          <span
            onClick={() => setShowPwConfirm((v) => !v)}
            style={{ position: "absolute", right: 16, top: 14, cursor: "pointer" }}
          >
            👁
          </span>
        </div>
        {newPwConfirm && newPw !== newPwConfirm && (
          <div style={{ fontSize: 12, color: RED, marginTop: -8, marginBottom: 12 }}>비밀번호가 일치하지 않습니다.</div>
        )}
      </div>
      <div style={footerStyle}>
        <button style={canSubmit ? primaryBtn : disabledBtn} onClick={handleSubmit}>
          {signingUp ? "가입 중..." : "다음"}
        </button>
      </div>

      {validationError && (
        // 확인을 누르면 이전 화면으로 돌아가지 않고, 같은 화면에서 값을 고칠 수 있게 합니다.
        <AlertDialog message={validationError} onConfirm={() => setValidationError("")} />
      )}
      {signupError && <AlertDialog message={signupError} onConfirm={() => setSignupError("")} />}
    </div>
  );
}

function Login({ loginId, setLoginId, loginPw, setLoginPw, loginError, setLoginError, loggingIn, setLoggingIn, setScreen, setToken }) {
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false); // 디자인 반영용 토글 (로그인 상태 유지 기능은 별도 구현 필요)
  const [selectedLink, setSelectedLink] = useState(""); // 아이디 찾기 / 비밀번호 재설정 / 회원가입 중 클릭한 항목

  async function handleLogin() {
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await loginApi({ id: loginId, password: loginPw });
      if (res.success) {
        setLoggingIn(false);
        setToken(res.token || "");
        // 로그인 성공 시 바로 홈으로 가지 않고, 처음 스플래시와 같은 3초 로딩 화면을 한 번 더 보여줍니다.
        setScreen("loginLoading");
      } else {
        setLoggingIn(false);
        setLoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
        setLoginId("");
        setLoginPw("");
      }
    } catch (e) {
      setLoggingIn(false);
      setLoginError(e.message || "로그인 중 오류가 발생했습니다.");
      setLoginId("");
      setLoginPw("");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, textAlign: "center", marginTop: 16, marginBottom: 8 }}>
          헌혈은 사랑입니다
        </div>
        <div style={{ color: "#666", fontSize: 14, textAlign: "center", marginBottom: 28 }}>블러드 링크에 오신 것을 환영합니다</div>
        <input style={inputStyle} placeholder="아이디" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
        <div style={{ position: "relative" }}>
          <input
            style={inputStyle}
            type={showLoginPw ? "text" : "password"}
            placeholder="비밀번호"
            value={loginPw}
            onChange={(e) => setLoginPw(e.target.value)}
          />
          <span onClick={() => setShowLoginPw((v) => !v)} style={{ position: "absolute", right: 16, top: 14, cursor: "pointer" }}>
            👁
          </span>
        </div>
        {loginError && (
          <div style={{ fontSize: 12, color: RED, marginTop: -8, marginBottom: 12 }}>{loginError}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => setAutoLogin((v) => !v)}
            style={{
              background: autoLogin ? BLACK : "#fff",
              color: autoLogin ? "#fff" : BLACK,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* 와이어프레임의 오각형 아이콘을 그대로 사용 (실제 아이콘/폰트는 추후 교체) */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={autoLogin ? "#fff" : BLACK} strokeWidth="1.6" aria-hidden="true">
              <path d="M12 2 L22 9.5 L18.2 21 L5.8 21 L2 9.5 Z" />
            </svg>
            자동 로그인
          </button>
        </div>
      </div>
      {/* 로그인 버튼은 흰 배경 위에 단독으로, 아이디 찾기/비밀번호 재설정/회원가입은 그 아래 별도의
          회색 배경 줄로 분리합니다(하나의 회색 블록으로 합치지 않습니다). */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ padding: "16px 20px 16px" }}>
          <button style={loggingIn ? disabledBtn : primaryBtn} disabled={loggingIn} onClick={handleLogin}>
            {loggingIn ? "로그인 중..." : "로그인"}
          </button>
        </div>
        <div style={{ background: GREY_BG, padding: "16px 20px", display: "flex", justifyContent: "center", gap: 24, fontSize: 13, color: "#555" }}>
          {["아이디 찾기", "비밀번호 재설정", "회원가입"].map((label) => (
            <span
              key={label}
              onClick={() => {
                setSelectedLink(label);
                // 회원가입 항목은 실제로 이동 가능한 화면이 있으므로 눌렀을 때 그 화면으로 보냅니다.
                if (label === "회원가입") setScreen("signupSelect");
              }}
              style={{
                cursor: "pointer",
                paddingBottom: 3,
                borderBottom: selectedLink === label ? `2px solid ${BLACK}` : "2px solid transparent",
                color: selectedLink === label ? BLACK : "#555",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// 홈/설정 API에서 받아온 예측 데이터를 그려주는 영역입니다.
// data 구조는 fetchHomeApi의 응답 형태(HomeResponse)와 동일합니다.
function BloodSupplyForecast({ data }) {
  const maxValue = Math.max(...data.predicted_volumes, 1);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ border: `1.5px solid ${BLACK}`, borderRadius: 14, padding: "18px 16px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, textAlign: "center" }}>
          {data.blood_type}형 혈액 보유량 예상 추이
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130, padding: "0 4px" }}>
          {data.predicted_volumes.map((value, i) => (
            <div
              key={i}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}
            >
              <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>{value.toLocaleString()}</div>
              <div
                style={{
                  width: "100%",
                  maxWidth: 34,
                  height: `${Math.max((value / maxValue) * 100, 4)}%`,
                  background: i === 0 ? BLACK : "#5b6472",
                  borderRadius: 4,
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#888", padding: "0 4px" }}>
          {data.predicted_dates.map((label, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              {label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>현재 상태: '{data.current_status}'</div>
        <div style={{ fontSize: 12, color: "#666" }}>{data.ai_comment}</div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.5 }}>
          다음 상태 '{data.next_status}' 격상 가능성 {data.risk_probability}%
        </div>
      </div>
    </div>
  );
}

function Home({ storage, setStorage, setScreen, token }) {
  const [homeData, setHomeData] = useState(null);
  const [homeError, setHomeError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchHomeApi(token)
      .then((data) => {
        if (!cancelled) setHomeData(data);
      })
      .catch((e) => {
        if (!cancelled) setHomeError(e.message || "홈 화면 데이터를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 온보딩에서 Rh형을 "모름"으로 입력한 경우의 엣지케이스입니다.
  const rhMissing = (homeData ? homeData.rh_type : storage.rhType) === "모름";

  // 혈액형 + Rh를 "B+"같은 한 글자 라벨로 합칩니다. (Rh를 모르면 혈액형만 표시)
  const bloodType = homeData ? homeData.blood_type : storage.bloodType;
  const rhType = homeData ? homeData.rh_type : storage.rhType;
  const bloodLabel = bloodType && rhType && !rhMissing ? `${bloodType}${rhType === "Rh-" ? "-" : "+"}` : bloodType || "";

  const [nicknameDraft, setNicknameDraft] = useState(storage.nickname || "");

  const ddayBtnStyle = {
    ...buttonBase,
    background: BLACK,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
  };

  return (
    // 홈 화면 내용이 길기 때문에 이 화면만의 스크롤 영역을 두어(다른 화면과 동일한 패턴) 끝까지 볼 수 있게 합니다.
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* 엣지케이스: 온보딩에서 Rh형을 "모름"으로 입력했다면, 입력할 때까지 이 안내를 계속 띄웁니다. */}
        {rhMissing && (
          <div
            style={{
              background: GREY_BG,
              padding: "14px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, color: BLACK }}>RH 혈액형이 입력되지 않았습니다.</span>
            <button
              onClick={() => setScreen("editRh")}
              style={{
                background: BLACK,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              입력하기
            </button>
          </div>
        )}

        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: GREY_BG,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true">
                <path d="M50 10 C50 10 26 42 26 60 A24 24 0 0 0 74 60 C74 42 50 10 50 10 Z" fill={RED} />
              </svg>
            </div>
            {/* 실제 저장은 회원가입 때 입력한 닉네임을 그대로 쓰고, 여기서는 바로 수정도 할 수 있게 해둡니다. */}
            <input
              value={nicknameDraft}
              onChange={(e) => {
                setNicknameDraft(e.target.value);
                setStorage((s) => ({ ...s, nickname: e.target.value }));
              }}
              placeholder="사용자 이름 입력란"
              maxLength={12}
              style={{
                textAlign: "center",
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                marginBottom: 8,
                width: 200,
                outline: "none",
                color: BLACK,
              }}
            />
            <div style={{ fontSize: 13, color: "#555" }}>나의 혈액형 : {bloodLabel || storage.bloodType || "미입력"}</div>
          </div>

          {homeError ? (
            <div style={{ color: RED, fontSize: 12, marginBottom: 24 }}>{homeError}</div>
          ) : homeData ? (
            <BloodSupplyForecast data={homeData} />
          ) : (
            <div style={{ color: "#888", fontSize: 12, marginBottom: 24 }}>혈액 보유량 예측을 불러오는 중...</div>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, color: "#888", marginBottom: 10 }}>나의 헌혈 가능일</div>
          <button onClick={() => setScreen("donationHistory")} style={ddayBtnStyle}>
            <span>나의 헌혈 가능일</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{homeData ? homeData.next_donation_dday : "불러오는 중..."}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// 홈 화면에서 "입력하기"를 눌러 Rh형을 나중에라도 채워 넣을 수 있는 화면입니다.
function EditRh({ storage, setStorage, setScreen }) {
  const [rh, setRh] = useState(storage.rhType && storage.rhType !== "모름" ? storage.rhType : null);
  const opts = ["Rh+", "Rh-", "모름"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={questionBandStyle}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{storage.nickname || storage.id}님</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Rh형을 입력해주세요.</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {opts.map((o) => (
          <OptionButton key={o} active={rh === o} onClick={() => setRh(o)}>
            {o}
          </OptionButton>
        ))}
      </div>
      <div style={footerStyle}>
        <button
          style={rh ? primaryBtn : disabledBtn}
          disabled={!rh}
          onClick={() => {
            setStorage((s) => ({ ...s, rhType: rh }));
            setScreen("home");
          }}
        >
          완료
        </button>
      </div>
    </div>
  );
}

// 헌혈 내역 조회 화면의 카드 한 줄 (날짜 / 장소 / 일시 / 헌혈 종류)
function DonationHistoryCard({ date, location, datetime, type }) {
  return (
    <div
      style={{
        border: `1.5px solid ${BLACK}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        display: "flex",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{date}</div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>장소 : {location}</div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>일시 : {datetime}</div>
        <div style={{ fontSize: 12, color: "#666" }}>헌혈 종류 : {type}</div>
      </div>
      {/* 실제 이미지가 들어가기 전 자리표시용 아이콘 (와이어프레임의 이미지 placeholder) */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 10,
          background: GREY_BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="2.6" fill="#b4b4bb" />
          <path d="M3 18 L9.5 10.5 L14 15.5 L17 12 L21 18 Z" fill="#b4b4bb" />
        </svg>
      </div>
    </div>
  );
}

// 헌혈 내역 조회 화면. 현재 데이터 구조상 회원가입 때 입력한 "최근 헌혈 날짜/방식" 1건만
// 정확한 값으로 갖고 있어서, 그 값을 기준으로 화면 레이아웃 확인용 더미 이력을 몇 건 더 만들어 보여줍니다.
// (백엔드에서 전체 헌혈 이력 목록 API를 받게 되면 이 배열을 그 응답으로 그대로 교체하면 됩니다.)
function DonationHistory({ storage }) {
  const hasHistory = !!storage.donationDate && storage.donationDate !== 0;

  const records = hasHistory
    ? Array.from({ length: 4 }, (_, i) => {
        const d = addDaysToDateString(storage.donationDate, -i * 30);
        const dotDate = toDateString({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }).replaceAll("-", ".");
        return {
          date: dotDate,
          location: "헌혈의 집 강동센터",
          datetime: `${dotDate}. 오전 10시`,
          type: storage.donationMethod || "정보 없음",
        };
      })
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: GREY_BG, padding: "14px 20px", fontSize: 13, fontWeight: 700, color: "#555", flexShrink: 0 }}>
        헌혈 내역 더보기
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {records.length === 0 ? (
          <div style={{ color: "#888", fontSize: 13, textAlign: "center", marginTop: 40 }}>헌혈 내역이 없습니다.</div>
        ) : (
          records.map((r, i) => <DonationHistoryCard key={i} {...r} />)
        )}
      </div>
    </div>
  );
}

// 켜고/끄는 토글 스위치 (설정 화면의 "전체 알림 수신"에 사용)
function ToggleSwitch({ on, onClick, ariaLabel }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 44,
        height: 26,
        borderRadius: 999,
        border: "none",
        background: on ? BLACK : "#d8d8db",
        position: "relative",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .15s ease",
        }}
      />
    </button>
  );
}

// 실제 API 값(숫자 문자열)과 화면에 보여줄 문구를 분리해둡니다.
const FREQUENCY_OPTIONS = [
  { value: "1", label: "매일" },
  { value: "2", label: "2일마다" },
  { value: "3", label: "3일마다" },
  { value: "7", label: "일주일마다" },
  { value: "14", label: "2주마다" },
  { value: "재수신하지않음", label: "재수신 안함" },
];
const SENSITIVITY_OPTIONS = ["민감", "보통", "둔함"];
const RESEND_COUNT_OPTIONS = [1, 2, 3, 4, 5];

// 설정 화면. 알림 on/off, 민감도, 알림 수신 주기, 재수신 횟수를 다루고 "회원 정보 수정"으로 들어가는 입구입니다.
// 값은 화면 진입 시 GET /settings 로 불러오고, 변경할 때마다 해당 PATCH API를 바로 호출합니다.
function SettingsScreen({ token, setScreen }) {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [showDisableAllConfirm, setShowDisableAllConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSettingsApi(token)
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message || "설정 정보를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!settings) {
    return (
      <div style={{ padding: 20, fontSize: 13, color: loadError ? RED : "#888" }}>
        {loadError || "설정을 불러오는 중..."}
      </div>
    );
  }

  async function applyNotification(enabled) {
    setSettings(await updateNotificationApi(token, enabled));
  }
  async function applySensitivity(sensitivity) {
    setSettings(await updateSensitivityApi(token, sensitivity));
  }
  async function applyFrequency(frequency) {
    setSettings(await updateFrequencyApi(token, frequency));
  }
  async function applyResendCount(resendCount) {
    setSettings(await updateResendCountApi(token, resendCount));
  }

  const resendDisabled = settings.frequency === "재수신하지않음";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>전체 알림 수신</span>
          <ToggleSwitch
            on={settings.notification_enabled}
            ariaLabel="전체 알림 수신 토글"
            onClick={() => {
              if (settings.notification_enabled) {
                // 끄려고 할 때만 안내 팝업을 띄웁니다. 켤 때는 바로 켭니다.
                setShowDisableAllConfirm(true);
              } else {
                applyNotification(true);
              }
            }}
          />
        </div>

        <SelectRow
          label="혈액 알림 민감도"
          value={settings.sensitivity}
          options={SENSITIVITY_OPTIONS}
          onChange={applySensitivity}
          stringValue
        />

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>알림 수신 주기</div>
          <select
            value={settings.frequency}
            onChange={(e) => applyFrequency(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${BORDER}`,
              fontSize: 15,
              background: "#fff",
              color: BLACK,
              colorScheme: "light",
            }}
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ opacity: resendDisabled ? 0.4 : 1, pointerEvents: resendDisabled ? "none" : "auto" }}>
          <SelectRow
            label="재수신 횟수"
            value={settings.resend_count || ""}
            options={RESEND_COUNT_OPTIONS}
            onChange={applyResendCount}
          />
        </div>

        <button style={{ ...primaryBtn, marginTop: 12 }} onClick={() => setScreen("confirmPassword")}>
          회원 정보 수정
        </button>
      </div>

      {showDisableAllConfirm && (
        <AlertDialog
          message="알림을 비활성화하면 일부 서비스 이용이 어려울 수 있습니다. 그래도 비활성화하시겠습니까?"
          confirmText="예"
          cancelText="아니오"
          onConfirm={() => {
            applyNotification(false);
            setShowDisableAllConfirm(false);
          }}
          onCancel={() => setShowDisableAllConfirm(false)}
        />
      )}
    </div>
  );
}

// "회원 정보 수정"에 들어가기 전, 본인 확인을 위해 현재 비밀번호를 한 번 더 입력받는 화면입니다.
// 현재 비밀번호 확인창은 화면에 바로 펼쳐두지 않고, 회원가입 동의 시트와 같은 방식으로
// 화면 아래에서 위로 슬라이드되어 올라오는 시트 형태로 보여줍니다.
function ConfirmPassword({ storage, setScreen }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  function handleConfirm() {
    // 목업 모드 기준: 로그인에 성공해 storage에 저장돼 있는 비밀번호와 비교합니다.
    if (pw && pw === storage.password) {
      setPw("");
      setScreen("editProfile");
    } else {
      setError("비밀번호가 올바르지 않습니다.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", background: GREY_BG }}>
      <div style={{ flex: 1 }} />

      <div
        style={{
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          padding: "14px 20px 24px",
          boxShadow: "0 -12px 32px rgba(0,0,0,0.15)",
          flexShrink: 0,
          animation: "sheetSlideUp .25s ease-out",
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: BORDER, margin: "0 auto 20px" }} />
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.6, marginBottom: 16 }}>
          {storage.nickname || storage.id}님의 정보 보호를 위해
          <br />
          현재 비밀번호를 확인해 주세요.
        </div>
        <input
          style={{ ...inputStyle, marginBottom: 16 }}
          type="password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setError("");
          }}
        />
        <button style={pw ? primaryBtn : disabledBtn} disabled={!pw} onClick={handleConfirm}>
          확인
        </button>
      </div>

      {error && <AlertDialog message={error} onConfirm={() => setError("")} />}
    </div>
  );
}

// 회원 정보 수정 화면. 현재 회원 정보를 미리 채워두고, 바뀐 값이 있을 때만 저장합니다.
function EditProfile({ storage, setStorage, setScreen }) {
  const [name, setName] = useState(storage.nickname || "");
  const [id, setId] = useState(storage.id || "");
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [bloodType, setBloodType] = useState(storage.bloodType || "");
  const [rhType, setRhType] = useState(storage.rhType || "");
  const [birth, setBirth] = useState(() => {
    const [y, m, d] = (storage.birthdate || "--").split("-");
    return { year: y ? Number(y) : "", month: m ? Number(m) : "", day: d ? Number(d) : "" };
  });
  const [donationMethod, setDonationMethod] = useState(storage.donationMethod || "");

  const [noChangeError, setNoChangeError] = useState(false);
  const [ageError, setAgeError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const BLOOD_OPTS = ["A", "B", "O", "AB"];
  const RH_OPTS = ["Rh+", "Rh-", "모름"];
  const METHOD_OPTS = ["전혈", "혈소판성분헌혈", "혈장성분헌혈", "혈소판혈장성분헌혈", "모름"];

  const hasYear = birth.year !== "";
  const hasMonth = birth.month !== "";
  const maxDay = hasYear && hasMonth ? daysInMonth(birth.year, birth.month) : 31;
  const dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);

  function updateYear(year) {
    setBirth((b) => ({ ...b, year, day: b.day === "" || !b.month ? b.day : Math.min(b.day, daysInMonth(year, b.month)) }));
  }
  function updateMonth(month) {
    setBirth((b) => ({ ...b, month, day: b.day === "" || !b.year ? b.day : Math.min(b.day, daysInMonth(b.year, month)) }));
  }

  function isChanged() {
    const newBirthdate = birth.year && birth.month && birth.day ? toDateString(birth) : "";
    return (
      name.trim() !== (storage.nickname || "") ||
      id !== (storage.id || "") ||
      (pw && pw.length > 0) ||
      bloodType !== (storage.bloodType || "") ||
      rhType !== (storage.rhType || "") ||
      newBirthdate !== (storage.birthdate || "") ||
      donationMethod !== (storage.donationMethod || "")
    );
  }

  function handleSubmit() {
    if (!isChanged()) {
      setNoChangeError(true);
      return;
    }
    if (birth.year && birth.month && birth.day) {
      const age = calcAge(new Date(birth.year, birth.month - 1, birth.day), new Date());
      if (age < MIN_AGE) {
        setAgeError(`만 ${MIN_AGE}세 미만일 경우 헌혈에 참여할 수 없습니다.`);
        return;
      }
      if (age > EDIT_PROFILE_MAX_AGE) {
        setAgeError(`만 ${EDIT_PROFILE_MAX_AGE}세 초과일 경우 헌혈에 참여할 수 없습니다.`);
        return;
      }
    }
    setShowConfirm(true);
  }

  function applyChanges() {
    setStorage((s) => ({
      ...s,
      nickname: name.trim() || s.nickname,
      id: id || s.id,
      password: pw ? pw : s.password,
      bloodType: bloodType || s.bloodType,
      rhType: rhType || s.rhType,
      birthdate: birth.year && birth.month && birth.day ? toDateString(birth) : s.birthdate,
      donationMethod: donationMethod || s.donationMethod,
    }));
    setShowConfirm(false);
    setScreen("home");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>이름</div>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} maxLength={12} />

        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>아이디</div>
        <input style={inputStyle} value={id} onChange={(e) => setId(e.target.value)} />

        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>비밀번호</div>
        <div style={{ position: "relative" }}>
          <input
            style={inputStyle}
            type={showPw ? "text" : "password"}
            placeholder="변경하지 않으려면 비워두세요"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <span onClick={() => setShowPw((v) => !v)} style={{ position: "absolute", right: 16, top: 14, cursor: "pointer" }}>
            👁
          </span>
        </div>

        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>비밀번호 확인</div>
        <div style={{ position: "relative" }}>
          <input
            style={inputStyle}
            type={showPwConfirm ? "text" : "password"}
            placeholder="변경하지 않으려면 비워두세요"
            value={pwConfirm}
            onChange={(e) => setPwConfirm(e.target.value)}
          />
          <span onClick={() => setShowPwConfirm((v) => !v)} style={{ position: "absolute", right: 16, top: 14, cursor: "pointer" }}>
            👁
          </span>
        </div>
        {pw && pw !== pwConfirm && (
          <div style={{ fontSize: 12, color: RED, marginTop: -8, marginBottom: 12 }}>비밀번호가 일치하지 않습니다.</div>
        )}

        <SelectRow label="혈액형" value={bloodType} options={BLOOD_OPTS} onChange={setBloodType} stringValue />
        <SelectRow label="RH" value={rhType} options={RH_OPTS} onChange={setRhType} stringValue />

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SelectRow label="생년월일 (연)" value={birth.year} options={YEARS} onChange={updateYear} />
          </div>
          <div style={{ flex: 1 }}>
            <SelectRow label="생년월일 (월)" value={birth.month} options={MONTHS} onChange={updateMonth} />
          </div>
          <div style={{ flex: 1 }}>
            <SelectRow label="생년월일 (일)" value={birth.day} options={dayOptions} onChange={(v) => setBirth((b) => ({ ...b, day: v }))} />
          </div>
        </div>

        <SelectRow label="헌혈 방식" value={donationMethod} options={METHOD_OPTS} onChange={setDonationMethod} stringValue />
      </div>
      <div style={footerStyle}>
        <button style={pw && pw !== pwConfirm ? disabledBtn : primaryBtn} disabled={pw && pw !== pwConfirm} onClick={handleSubmit}>
          완료
        </button>
      </div>

      {noChangeError && <AlertDialog message="변경 사항이 없습니다." onConfirm={() => setNoChangeError(false)} />}
      {ageError && <AlertDialog title="경고" message={ageError} onConfirm={() => setAgeError("")} />}
      {showConfirm && (
        <AlertDialog
          message="회원 정보가 변경됩니다."
          confirmText="예"
          cancelText="아니오"
          onConfirm={applyChanges}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

const titles = {
  signupSelect: "회원가입",
  bloodNormal: "회원가입",
  bloodRh: "회원가입",
  birthdate: "회원가입",
  donationDate: "회원가입",
  donationMethod: "회원가입",
  nickname: "회원가입",
  idPwSignup: "회원가입",
  login: "로그인",
  home: "홈",
  donationHistory: "헌혈 내역 조회",
  editRh: "RH형 입력",
  settings: "설정",
  confirmPassword: "회원 정보 수정",
  editProfile: "회원 정보 수정",
};

const backTargets = {
  nickname: "signupSelect",
  bloodNormal: "nickname",
  bloodRh: "bloodNormal",
  birthdate: "bloodRh",
  donationDate: "birthdate",
  donationMethod: "donationDate",
  idPwSignup: "donationMethod",
  login: "idPwSignup",
  donationHistory: "home",
  editRh: "home",
  settings: "home",
  confirmPassword: "settings",
  editProfile: "confirmPassword",
};

export default function App() {
  const [screen, setScreen] = useState("splash");

  // 온보딩 중 임시 선택값
  const [normalBlood, setNormalBlood] = useState(null); // A / B / O / AB
  const [rhType, setRhType] = useState(null); // Rh+ / Rh- / 모름
  // 생년월일/최근 헌혈 날짜는 예시로 미리 채워두지 않고, 아무것도 고르지 않은 초기 상태("")로 시작합니다.
  const [birth, setBirth] = useState({ year: "", month: "", day: "" });
  const [donation, setDonation] = useState({ year: "", month: "", day: "" });
  const [noHistory, setNoHistory] = useState(false);
  const [method, setMethod] = useState(null);
  const [nickname, setNickname] = useState("");

  // 아이디/비번 회원가입 입력값
  const [newId, setNewId] = useState("");
  const [idChecked, setIdChecked] = useState(false);
  const [idChecking, setIdChecking] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [signingUp, setSigningUp] = useState(false);

  // 로그인 입력값
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // 로그인 API에서 받은 인증 토큰. 홈/설정 API 호출 시 Authorization 헤더로 사용합니다.
  const [token, setToken] = useState("");

  // ---------- 최초에 정의하는 빈 storage (서버로 보낼 회원 정보) ----------
  const [storage, setStorage] = useState({
    nickname: "", // 문자열
    bloodType: "", // 문자열, "A" | "B" | "O" | "AB"
    rhType: "", // 문자열, "Rh+" | "Rh-" | "모름" (혈액형과 별도로 저장)
    birthdate: "", // 문자열, 예: "2006-04-26"
    donationDate: "", // 문자열, 예: "2006-04-26" (내역 없으면 빈 문자열)
    donationMethod: "", // 문자열
    id: "", // 문자열
    password: "", // 문자열
  });

  // 1) 스플래시 -> 자동 전환 (로고 노출 3초)
  // 2) 로그인 성공 후에도 같은 로고 로딩 화면을 3초 보여준 뒤 홈으로 이동합니다.
  useEffect(() => {
    if (screen === "splash") {
      const t = setTimeout(() => setScreen("signupSelect"), 3000);
      return () => clearTimeout(t);
    }
    if (screen === "loginLoading") {
      const t = setTimeout(() => setScreen("home"), 3000);
      return () => clearTimeout(t);
    }
  }, [screen]);

  const bodies = {
    signupSelect: <SignupSelect setScreen={setScreen} />,
    bloodNormal: (
      <BloodNormal
        normalBlood={normalBlood}
        setNormalBlood={setNormalBlood}
        storage={storage}
        setStorage={setStorage}
        setScreen={setScreen}
      />
    ),
    bloodRh: (
      <BloodRh rhType={rhType} setRhType={setRhType} storage={storage} setStorage={setStorage} setScreen={setScreen} />
    ),
    birthdate: (
      <Birthdate birth={birth} setBirth={setBirth} storage={storage} setStorage={setStorage} setScreen={setScreen} />
    ),
    donationDate: (
      <DonationDate
        donation={donation}
        setDonation={setDonation}
        noHistory={noHistory}
        setNoHistory={setNoHistory}
        storage={storage}
        setStorage={setStorage}
        setScreen={setScreen}
      />
    ),
    donationMethod: (
      <DonationMethod method={method} setMethod={setMethod} storage={storage} setStorage={setStorage} setScreen={setScreen} />
    ),
    nickname: <Nickname nickname={nickname} setNickname={setNickname} setStorage={setStorage} setScreen={setScreen} />,
    idPwSignup: (
      <IdPwSignup
        newId={newId}
        setNewId={setNewId}
        idChecked={idChecked}
        setIdChecked={setIdChecked}
        idChecking={idChecking}
        setIdChecking={setIdChecking}
        newPw={newPw}
        setNewPw={setNewPw}
        newPwConfirm={newPwConfirm}
        setNewPwConfirm={setNewPwConfirm}
        showPw={showPw}
        setShowPw={setShowPw}
        showPwConfirm={showPwConfirm}
        setShowPwConfirm={setShowPwConfirm}
        signupError={signupError}
        setSignupError={setSignupError}
        signingUp={signingUp}
        setSigningUp={setSigningUp}
        storage={storage}
        setStorage={setStorage}
        setScreen={setScreen}
      />
    ),
    login: (
      <Login
        loginId={loginId}
        setLoginId={setLoginId}
        loginPw={loginPw}
        setLoginPw={setLoginPw}
        loginError={loginError}
        setLoginError={setLoginError}
        loggingIn={loggingIn}
        setLoggingIn={setLoggingIn}
        setScreen={setScreen}
        setToken={setToken}
      />
    ),
    home: <Home storage={storage} setStorage={setStorage} setScreen={setScreen} token={token} />,
    donationHistory: <DonationHistory storage={storage} />,
    editRh: <EditRh storage={storage} setStorage={setStorage} setScreen={setScreen} />,
    settings: <SettingsScreen token={token} setScreen={setScreen} />,
    confirmPassword: <ConfirmPassword storage={storage} setScreen={setScreen} />,
    editProfile: <EditProfile storage={storage} setStorage={setStorage} setScreen={setScreen} />,
  };

  // 홈 화면 헤더 오른쪽의 "+ 설정" 버튼 -> 설정 화면으로 이동합니다.
  const headerRight =
    screen === "home" ? (
      <button
        onClick={() => setScreen("settings")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: BLACK,
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "8px 14px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> 설정
      </button>
    ) : null;

  return (
    <div style={{ display: "flex", justifyContent: "center", background: "#e9e9ec", minHeight: "100vh", padding: 24, colorScheme: "light" }}>
      <div
        style={{
          width: 375,
          minHeight: 720,
          background: "#fff",
          borderRadius: 0,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          {screen === "splash" || screen === "loginLoading" ? (
            <Splash />
          ) : (
            <>
              <Header
                title={titles[screen]}
                onBack={backTargets[screen] ? () => setScreen(backTargets[screen]) : null}
                right={headerRight}
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{bodies[screen]}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}