// src/githubBackup.ts

import { safeFilePart } from "./logic";
import type {
  AppSettings,
  BackupPayload,
  Region,
  SurveyItem,
  SurveyPhoto,
  SurveyStore,
} from "./types";

const GITHUB_OWNER = "KPRC-EBIZ";
const GITHUB_REPO = "research_supporter_download";
const GITHUB_BRANCH = "main";

const stampTime = () =>
  new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

function utf8ToBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadJsonToGitHub(params: {
  token: string;
  path: string;
  jsonText: string;
  message: string;
}) {
  const apiUrl =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/` +
    encodeURIComponent(params.path).replaceAll("%2F", "/");

  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: params.message,
      content: utf8ToBase64(params.jsonText),
      branch: GITHUB_BRANCH,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub 업로드 실패: ${response.status}\n${errorText}`);
  }

  return await response.json() as {
    content?: {
      name: string;
      path: string;
      html_url: string;
      download_url: string;
    };
    commit?: {
      sha: string;
      html_url: string;
    };
  };
}

export async function uploadFullBackupJsonToGitHub(params: {
  token: string;
  region?: string;
  regions: Region[];
  stores: SurveyStore[];
  items: SurveyItem[];
  photos: SurveyPhoto[];
  settings: AppSettings;
  onProgress?: (message: string) => void;
}) {
  params.onProgress?.("사진을 JSON으로 변환 중입니다.");

  const photoPayload = await Promise.all(
    params.photos.map(async ({ blob, ...photo }, index) => {
      if (index % 5 === 0) {
        params.onProgress?.(
          `사진 변환 중 ${index + 1}/${params.photos.length}`
        );
      }

      return {
        ...photo,
        dataUrl: await blobToDataUrl(blob),
      };
    })
  );

  const payload: BackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    scope: params.region ? "region" : "all",
    region: params.region,
    regions: params.regions,
    stores: params.stores,
    items: params.items,
    photos: photoPayload,
    settings: params.settings,
  };

  const suffix = params.region ? safeFilePart(params.region) : "전체";
  const filename = `price_backup_FULL_${suffix}_${stampTime()}.json`;
  const path = `backups/full/${filename}`;
  const jsonText = JSON.stringify(payload, null, 2);
  const sizeMb = new Blob([jsonText]).size / 1024 / 1024;

  params.onProgress?.(
    `GitHub 업로드 중입니다. 파일 크기: ${sizeMb.toFixed(1)}MB`
  );

  const result = await uploadJsonToGitHub({
    token: params.token,
    path,
    jsonText,
    message: `backup full json: ${filename}`,
  });

  return {
    result,
    filename,
    path,
    sizeMb,
  };
}
