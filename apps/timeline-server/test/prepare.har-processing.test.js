import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHarProcessingPreview,
  inspectRoundHarProcessing,
  resolveEffectiveVideoStart,
} from "../src/lib/prepare.js";

function indentLines(lines, prefix = "  ") {
  return lines.map((line) => `${prefix}${line}`);
}

function formatPreviewLines(summary) {
  return summary.items.flatMap((item) => {
    const lines = [
      `- order: ${item.order}`,
      `  harEntryIndex: ${item.harEntryIndex}`,
      `  method: ${item.method}`,
      `  pathname: ${item.pathname}`,
      `  captureKind: ${item.captureKind}`,
      `  captureSec: ${item.captureSec}`,
      "  recording:",
    ];

    if (item.recordingLabels.length) {
      lines.push(...indentLines(item.recordingLabels.map((label) => `- ${label}`), "    "));
    } else {
      lines.push("    - (none)");
    }

    return lines;
  });
}

test("megageb_round1 前 10 個 HAR 處理請求可輸出 preview，且包含 login POST 與取圖秒數", async (t) => {
  const actual = await inspectRoundHarProcessing("megageb_round1", {
    limit: 10,
    videoDurationMs: 699867,
  });

  const lines = [
    "items:",
    ...indentLines(formatPreviewLines(actual)),
  ];
  if (typeof t.diagnostic === "function") {
    t.diagnostic("前 10 個 HAR 處理預覽");
    for (const line of lines) {
      t.diagnostic(line);
    }
  } else {
    console.log(["前 10 個 HAR 處理預覽", ...lines].join("\n"));
  }

  assert.equal(actual.roundId, "megageb_round1");
  assert.equal(actual.items.length, 10);
  assert.equal(actual.totalCaptureCount > 0, true);
  assert.equal(
    actual.items.every((item) => Number.isFinite(item.captureSec) && Array.isArray(item.recordingLabels)),
    true
  );
  assert.equal(
    actual.items.some(
      (item) => item.pathname === "/EB/login/login.faces" && item.captureKind === "post-before"
    ),
    true
  );
  assert.equal(
    actual.items.some(
      (item) => item.pathname === "/EB/login/login.faces" && item.captureKind === "post-after"
    ),
    true
  );
});

test("exclude_url_exprs 會排除指定 URL，但不會吃掉 baseline login 規則", () => {
  const har = {
    log: {
      entries: [
        {
          startedDateTime: "2026-04-17T03:21:49.529Z",
          time: 100,
          request: {
            method: "GET",
            url: "https://example.test/ignore/me.faces",
          },
          response: {
            content: {
              mimeType: "text/html",
            },
            headers: [
              {
                name: "Content-Type",
                value: "text/html; charset=UTF-8",
              },
            ],
          },
        },
        {
          startedDateTime: "2026-04-17T03:21:50.000Z",
          time: 120,
          request: {
            method: "GET",
            url: "https://example.test/EB/login/login.faces",
          },
          response: {
            content: {
              mimeType: "text/html",
            },
            headers: [
              {
                name: "Content-Type",
                value: "text/html; charset=UTF-8",
              },
            ],
          },
        },
        {
          startedDateTime: "2026-04-17T03:21:51.000Z",
          time: 350,
          request: {
            method: "POST",
            url: "https://example.test/EB/login/login.faces",
          },
          response: {
            content: {
              mimeType: "x-unknown",
            },
            headers: [],
          },
        },
      ],
    },
  };
  const recording = {
    steps: [
      {
        type: "click",
        target: "main",
        selectors: [["aria/登入"]],
      },
      {
        type: "click",
        target: "main",
        selectors: [["aria/登入"]],
      },
    ],
  };
  const baseline = {
    hasImage: false,
    config: {
      exclude_url_exprs: ["ignore/me\\.faces"],
      show_login_page: {
        uri: "/EB/login/login.faces",
        type: "GET",
      },
      submit_login_page: {
        uri: "/EB/login/login.faces",
        type: "POST",
        video_ms: 24500,
      },
    },
  };

  const preview = buildHarProcessingPreview({
    roundId: "roundx",
    har,
    recording,
    baseline,
    videoStartMs: new Date("2026-04-17T03:21:38.000Z").getTime(),
    videoDurationMs: 20_000,
    limit: 10,
  });

  assert.equal(preview.items.some((item) => item.url.includes("ignore/me.faces")), false);
  assert.deepStrictEqual(
    preview.items.map((item) => item.captureKind),
    ["post-before", "get-after", "post-after"]
  );
  assert.equal(
    preview.items.filter((item) => item.pathname === "/EB/login/login.faces").length,
    3
  );
  assert.equal(
    preview.items.some((item) => item.recordingLabels.includes("Click 登入")),
    true
  );
});

test("submit_login_page.video_ms 會以肉眼按下時間推回有效影片起點", () => {
  const har = {
    log: {
      entries: [
        {
          startedDateTime: "2026-04-17T03:22:15.418Z",
          request: {
            method: "POST",
            url: "https://example.test/EB/login/login.faces",
          },
        },
      ],
    },
  };
  const baseline = {
    hasConfig: true,
    config: {
      submit_login_page: {
        uri: "/EB/login/login.faces",
        type: "POST",
        video_ms: 24500,
      },
    },
  };

  const resolved = resolveEffectiveVideoStart({
    har,
    baseline,
    inferredVideoStartMs: new Date("2026-04-17T03:21:38.000Z").getTime(),
  });

  assert.equal(resolved.effectiveVideoStartSource, "submit_login_page.video_ms");
  assert.equal(resolved.matchedSubmitHarEntryIndex, 1);
  assert.equal(resolved.submitLoginVideoMs, 24500);
  assert.equal(resolved.matchedSubmitStartedAt, "2026-04-17T03:22:15.418Z");
  assert.equal(resolved.effectiveVideoStartMs, new Date("2026-04-17T03:21:50.418Z").getTime());
});

test("submit_login_page.video_ms 會選到最接近肉眼按下時間的 submit POST", () => {
  const har = {
    log: {
      entries: [
        {
          startedDateTime: "2026-04-17T03:22:15.418Z",
          request: {
            method: "POST",
            url: "https://example.test/EB/login/login.faces",
          },
        },
        {
          startedDateTime: "2026-04-17T03:25:45.691Z",
          request: {
            method: "POST",
            url: "https://example.test/EB/login/login.faces",
          },
        },
      ],
    },
  };
  const baseline = {
    hasConfig: true,
    config: {
      submit_login_page: {
        uri: "/EB/login/login.faces",
        type: "POST",
        video_ms: 24500,
      },
    },
  };

  const resolved = resolveEffectiveVideoStart({
    har,
    baseline,
    inferredVideoStartMs: new Date("2026-04-17T03:21:38.000Z").getTime(),
  });

  assert.equal(resolved.effectiveVideoStartSource, "submit_login_page.video_ms");
  assert.equal(resolved.matchedSubmitHarEntryIndex, 1);
  assert.equal(resolved.submitLoginVideoMs, 24500);
  assert.equal(resolved.effectiveVideoStartMs, new Date("2026-04-17T03:21:50.418Z").getTime());
});
