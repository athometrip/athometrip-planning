# MCP (Model Context Protocol) 도구 모음

앳홈트립 프로젝트의 외부 서비스 연동을 위한 CLI 도구 모음입니다.
Jira, Confluence, Figma API를 통해 개발 워크플로우를 자동화합니다.

## 폴더 구조

```
athometrip-planning/
├── .env                    # API 토큰 및 환경변수 (gitignore 대상)
├── MCP/
│   ├── README.md           # 현재 문서
│   ├── confluence-cli.js   # Confluence API CLI
│   ├── jira-cli.js         # Jira API CLI
│   ├── figma-cli.js        # Figma API CLI
│   ├── markdown-to-adf.js  # Markdown → ADF 변환기
│   ├── templates/          # ADF 샘플 템플릿
│   │   └── sample-body.json
│   └── archive/            # 과거 생성 문서 보관
│       ├── improved-guide-adf.json
│       └── product-guide-adf.json
└── report/
    ├── generate-report.js          # 리포트 자동 생성기
    └── november-2025-dev-summary-adf.json  # 생성된 리포트
```

## 환경 설정

### 필수 환경변수 (.env)

```bash
# Atlassian (Jira, Confluence)
ATLASSIAN_EMAIL=your-email@athometrip.com
CONFLUENCE_API_TOKEN=your-api-token

# Figma
FIGMA_PERSONAL_ACCESS_TOKEN=your-figma-token

# GitHub (선택)
GITHUB_TOKEN=your-github-token
```

### 환경변수 로드

```bash
# 스크립트 실행 전 환경변수 로드
source .env

# 또는 inline으로 전달
ATLASSIAN_EMAIL=xxx CONFLUENCE_API_TOKEN=xxx node MCP/jira-cli.js ...
```

---

## Confluence CLI

Confluence 페이지 조회, 생성, 수정, 삭제를 위한 도구입니다.

### 명령어

```bash
# 스페이스 정보 조회
node MCP/confluence-cli.js space

# 페이지 목록 조회
node MCP/confluence-cli.js pages --limit 10

# 특정 페이지 조회 (본문 포함)
node MCP/confluence-cli.js page --id 56722173 --body

# 페이지 생성
node MCP/confluence-cli.js create \
  --title "새 문서 제목" \
  --body-file MCP/templates/sample-body.json \
  --parent 56722173

# 페이지 수정
node MCP/confluence-cli.js update \
  --id <pageId> \
  --title "수정된 제목" \
  --body-file MCP/templates/sample-body.json

# 페이지 삭제
node MCP/confluence-cli.js delete --id <pageId>
```

### 주요 페이지 ID

| 페이지 | ID | 설명 |
| --- | --- | --- |
| 앳홈트립 개발팀 (홈) | `56722173` | Product 스페이스 홈페이지 |
| Product 스페이스 | `56721899` | 스페이스 ID |

### API 참고

| 작업 | 엔드포인트 |
| --- | --- |
| 스페이스 조회 | `GET /wiki/api/v2/spaces?keys=Product` |
| 페이지 목록 | `GET /wiki/api/v2/spaces/{spaceId}/pages` |
| 페이지 조회 | `GET /wiki/api/v2/pages/{pageId}?body-format=atlas_doc_format` |
| 페이지 생성 | `POST /wiki/api/v2/pages` |
| 페이지 수정 | `PUT /wiki/api/v2/pages/{pageId}` |
| 페이지 삭제 | `DELETE /wiki/api/v2/pages/{pageId}` |

---

## Jira CLI

Jira 이슈 조회, 생성, 상태 전환을 위한 도구입니다.

### 명령어

```bash
# 프로젝트 목록
node MCP/jira-cli.js projects --max 20

# 이슈 검색 (JQL)
node MCP/jira-cli.js search --jql "project = PRODUCT ORDER BY updated DESC" --max 10

# 이슈 상세 조회
node MCP/jira-cli.js issue --key PRODUCT-123

# 이슈 생성
node MCP/jira-cli.js create \
  --project PRODUCT \
  --type Task \
  --summary "작업 제목" \
  --description "작업 설명"

# 전환 가능한 상태 조회
node MCP/jira-cli.js transitions --key PRODUCT-123

# 상태 전환
node MCP/jira-cli.js transition --key PRODUCT-123 --id 41

# 코멘트 추가
node MCP/jira-cli.js comment --key PRODUCT-123 --text "코멘트 내용"
```

### 프로젝트 정보

| 프로젝트 | 키 | 설명 |
| --- | --- | --- |
| Product | `PRODUCT` | 프로덕트 개발 이슈 |

---

## Figma CLI

Figma 파일 및 노드 정보를 조회하는 도구입니다.

### 명령어

```bash
# Figma 파일 전체 구조 조회
FIGMA_PERSONAL_ACCESS_TOKEN=$FIGMA_PERSONAL_ACCESS_TOKEN \
  node MCP/figma-cli.js file --key PuaTrGTcY3Q5OU7UFClAOo

# 특정 노드만 조회
FIGMA_PERSONAL_ACCESS_TOKEN=$FIGMA_PERSONAL_ACCESS_TOKEN \
  node MCP/figma-cli.js nodes --key PuaTrGTcY3Q5OU7UFClAOo --ids 337-796,337-158

# 노드 이미지 URL 발급
FIGMA_PERSONAL_ACCESS_TOKEN=$FIGMA_PERSONAL_ACCESS_TOKEN \
  node MCP/figma-cli.js images --key PuaTrGTcY3Q5OU7UFClAOo --ids 337-796 --format png --scale 2
```

### 프로젝트 Figma 파일

| 파일명 | File Key | URL |
| --- | --- | --- |
| 신규 통합기획문서 | `PuaTrGTcY3Q5OU7UFClAOo` | [Figma 링크](https://www.figma.com/design/PuaTrGTcY3Q5OU7UFClAOo) |

### 주요 캔버스 ID

| 캔버스 | Node ID |
| --- | --- |
| 공통, 헤더, GNB | `337:796` |
| 메인 | `337:158` |
| 티켓/투어 | `341:4857` |
| 마이페이지 | `341:3907` |
| 장바구니/결제 | `341:3909` |

### MCP 서버 연동 (Claude Code)

```bash
# Desktop MCP Server (Figma 앱 필요)
claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp -s local

# Remote MCP Server (OAuth 인증)
claude mcp add --transport http figma https://mcp.figma.com/mcp -s local
```

---

## 리포트 자동화

`report/generate-report.js`를 통해 주간/월간 개발 리포트를 자동 생성합니다.

### 사용법

```bash
# 월간 리포트
node report/generate-report.js --month 2025-11

# 주간 리포트 (ISO week)
node report/generate-report.js --week 2025-W49

# 날짜 범위 지정
node report/generate-report.js --from 2025-11-01 --to 2025-11-30

# Confluence 자동 업로드
node report/generate-report.js --month 2025-11 --upload

# 출력 파일 지정
node report/generate-report.js --month 2025-11 --output report/custom-name.json
```

### 옵션

| 옵션 | 설명 | 예시 |
| --- | --- | --- |
| `--month` | 월간 리포트 | `--month 2025-11` |
| `--week` | 주간 리포트 | `--week 2025-W49` |
| `--from` | 시작일 | `--from 2025-11-01` |
| `--to` | 종료일 | `--to 2025-11-30` |
| `--output` | 출력 파일명 | `--output report/my-report.json` |
| `--upload` | Confluence 업로드 | (플래그) |
| `--parent-id` | 부모 페이지 ID | `--parent-id 56722173` |

### 수집 데이터

| 소스 | API | 수집 내용 |
| --- | --- | --- |
| Jira | Atlassian REST API v3 | 이슈 목록, 상태, 담당자 |
| GitHub | git log (로컬) | 커밋 수, 작성자, 날짜 |
| Figma | Figma REST API v1 | 캔버스 목록, 진척률 |

### 출력 구조

1. **데이터 수집 방법** - API, 조회 조건, 수집 시점
2. **정량적 성과** - Jira 이슈, GitHub 커밋, Figma 진척률
3. **주요 작업 카테고리** - 픽패스, 마이페이지, 파트너센터, 바우처/결제
4. **Figma 디자인 현황** - 캔버스별 상태, 진척률 산출 근거

---

## ADF (Atlassian Document Format)

Confluence 페이지 본문은 ADF JSON 형식을 사용합니다.

### 기본 구조

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [{ "type": "text", "text": "제목" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "본문 내용" }]
    }
  ]
}
```

### Markdown 변환

```bash
# Markdown 파일을 ADF로 변환
node MCP/markdown-to-adf.js input.md output.json
```

### 템플릿

- `MCP/templates/sample-body.json` - 기본 ADF 템플릿

---

## 문제 해결

### "Missing API Token" 에러
- `.env` 파일에 해당 토큰이 설정되어 있는지 확인
- `source .env` 실행 후 재시도

### Confluence 페이지 수정 실패
- 페이지 버전 충돌 가능성 확인
- `--id` 파라미터가 올바른지 확인

### Figma 연결 실패
- Desktop MCP: Figma 앱 실행 및 Dev Mode 활성화 확인
- Remote MCP: OAuth 인증 완료 확인
