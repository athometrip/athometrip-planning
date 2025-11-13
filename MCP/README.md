## Atlassian 연동 메모

### 1. 공통 준비 사항
- Confluence/Jira 모두 Atlassian Cloud 계정(email + API Token)으로 Basic Auth 사용.
- 민감 정보는 루트 `.env`에 `CONFLUENCE_API_TOKEN` 등 변수로 관리하고, 스크립트에서는 `source .env` 후 환경변수 사용.
- 네트워크 제한 환경에서는 명령 실행 전 승인 필요할 수 있으니 CLI 안내 메시지를 확인.

### 2. Confluence REST 활용
| 목적 | 엔드포인트 | 비고 |
| --- | --- | --- |
| 스페이스 조회 | `GET /wiki/api/v2/spaces?keys=Product&expand=homepage` | Product 스페이스 메타 및 홈 ID(현재 `56722173`) 확인 |
| 페이지 목록 | `GET /wiki/api/v2/spaces/{spaceId}/pages?limit=50` | 최상위 문서/회의록 구조 파악 시 사용 |
| 단일 페이지 조회 | `GET /wiki/api/v2/pages/{pageId}?body-format=atlas_doc_format` | 최신 버전, 작성자, 본문 JSON 획득 |
| 페이지 생성 | `POST /wiki/api/v2/pages` | `spaceId`, `parentId`, `title`, `body.atlas_doc_format` 필수 |
| 페이지 삭제 | `DELETE /wiki/api/v2/pages/{pageId}` | 삭제 권한 필요, 휴지통 규칙 확인 |

#### cURL 템플릿
```bash
curl -s -u "sunho.kim@athometrip.com:${CONFLUENCE_API_TOKEN}" \
  -H "Accept: application/json" \
  "https://athometrip.atlassian.net/wiki/api/v2/spaces?keys=Product&expand=homepage"
```
> 필요시 `jq`를 추가해 JSON 파싱. CLI에서 `jq` 실행이 제한될 수 있으니 실패 시 로컬에서 파싱하거나 Node/Python 스크립트 활용.

### 3. Product 스페이스 현황 (2025-11-12 기준)
- 홈(`앳홈트립 개발팀`, pageId `56722173`)은 2025-11-12 버전 20까지 갱신됨. 개발팀 구성/서비스 소개 등 최신 설명 포함.
- 상위 문서들은 제목 끝에 날짜를 붙이는 규칙(`제목_YYMMDD`)으로 정리되었고, 2025-10-20에 일괄 리네이밍 로그가 남아 있음.
- 최근 문서 예시:
  - `전체 미팅 메모_250102` (id `32081137`, v6)
  - `README - GAIA Development Overview_250109` (id `34635873`, v9)
  - `앳홈트립 권한 관리 정책_250109` (id `34635851`, v6)
- 각 문서 body는 API로 조회 가능하므로, 개발 상태와 문서 최신화 여부 체크 시 해당 ID들을 반복 호출하면 됨.

### 4. 문서 작성/삭제 워크플로 제안
1. **작성**: 로컬에서 atlas_doc_format JSON 생성 → `/pages` POST → 반환되는 pageId 저장.
2. **검토**: 웹 UI에서 확인하고 필요 시 추가 편집.
3. **삭제**: 작업 근거(예: Jira 이슈 링크)를 코멘트로 남기고 `/pages/{id}` DELETE → 휴지통 비우기 여부는 관리자 정책에 따름.

### 5. Jira 연동 TODO
- 현재 Jira API 정리 문서는 없음. 필요 시 동일 폴더에 `jira.md` 생성해 이슈 생성/상태 전환 API, git 커밋 네이밍 규칙 등을 정리 예정.

## CLI 스크립트
- `confluence-cli.js`를 통해 기본적인 조회 작업 자동화.
- 사용 전 루트에서 `. ./.env`로 환경변수 로드.

```bash
# 스페이스 메타 + 홈 ID
node athometrip-planning/MCP/confluence-cli.js space

# Product 스페이스 페이지 목록 10건
node athometrip-planning/MCP/confluence-cli.js pages --limit 10

# 특정 페이지 세부 정보 + 본문
node athometrip-planning/MCP/confluence-cli.js page --id 56722173 --body

# 페이지 삭제
node athometrip-planning/MCP/confluence-cli.js delete --id <pageId>

# 페이지 생성 (atlas_doc_format JSON 파일 필요)
node athometrip-planning/MCP/confluence-cli.js create \
  --title "새 문서 제목" \
  --body-file ./athometrip-planning/MCP/sample-body.json \
  --parent 56722173

# 페이지 수정 (본문 파일 미지정 시 기존 본문 유지)
node athometrip-planning/MCP/confluence-cli.js update \
  --id <pageId> \
  --title "업데이트된 제목" \
  --body-file ./athometrip-planning/MCP/sample-body.json
```

> `body-file`에는 Atlas Doc Format JSON 문자열이 들어가야 합니다. 예시는 추후 `sample-body.json`으로 추가할 수 있습니다.

## Figma 연동

### 1. 토큰 준비
- Figma 계정 Settings → Personal Access Tokens에서 토큰 생성
  - URL: https://www.figma.com/settings (Personal Access Tokens 섹션)
- 로컬 `.env`에 `FIGMA_PERSONAL_ACCESS_TOKEN=<token>`을 추가하세요

**예시**:
```bash
# .env 파일에 추가
FIGMA_PERSONAL_ACCESS_TOKEN=figd_xxxxxxxxxxxxxxxxxxxxx
```

### 2. MCP 서버 설정 (Claude Code / VSCode)

Figma는 두 가지 MCP 서버 방식을 지원합니다:

#### 방법 1: Desktop MCP Server (권장)
Figma Desktop 앱을 통해 로컬에서 실행되는 MCP 서버를 사용합니다.

**설정 단계**:
1. Figma Desktop 앱을 최신 버전으로 업데이트
2. Figma에서 Design 파일 열기
3. Dev Mode로 전환 (`Shift + D`)
4. Inspect 패널에서 "Enable desktop MCP server" 클릭
5. MCP 서버 추가:
   ```bash
   claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp -s local
   ```

**VSCode에서 설정**:
1. `⌘ + Shift + P` → "MCP: Add Server" 검색
2. "HTTP" 선택
3. URL 입력: `http://127.0.0.1:3845/mcp`
4. Server ID: `figma-desktop`
5. Scope 선택 (Global 또는 Workspace)

**연결 확인**:
```bash
claude mcp list
# figma-desktop: http://127.0.0.1:3845/mcp (HTTP) - ✓ Connected
```

#### 방법 2: Remote MCP Server
Figma 공식 호스팅 서버를 사용합니다 (OAuth 인증 필요).

```bash
claude mcp add --transport http figma https://mcp.figma.com/mcp -s local
```

인증은 VSCode MCP 설정에서 "Authenticate" 버튼을 통해 진행합니다.

### 3. CLI 사용법
- 스크립트 위치: `athometrip-planning/MCP/figma-cli.js`
- 기본 엔드포인트: `https://api.figma.com/v1`
- 환경 변수로 토큰 전달 필요

```bash
# 환경 변수 설정 후 실행
export FIGMA_PERSONAL_ACCESS_TOKEN=figd_xxxxxxxxxxxxxxxxxxxxx

# 또는 inline으로 실행
FIGMA_PERSONAL_ACCESS_TOKEN=figd_xxxxx node athometrip-planning/MCP/figma-cli.js file --key <fileKey>

# Figma 파일 전체 구조 조회
FIGMA_PERSONAL_ACCESS_TOKEN=figd_xxxxx node athometrip-planning/MCP/figma-cli.js file --key PuaTrGTcY3Q5OU7UFClAOo

# 특정 노드만 가져오기
FIGMA_PERSONAL_ACCESS_TOKEN=figd_xxxxx node athometrip-planning/MCP/figma-cli.js nodes --key PuaTrGTcY3Q5OU7UFClAOo --ids 337-796,337-158

# 노드 이미지 URL 발급 (PNG, scale 2배)
FIGMA_PERSONAL_ACCESS_TOKEN=figd_xxxxx node athometrip-planning/MCP/figma-cli.js images --key PuaTrGTcY3Q5OU7UFClAOo --ids 337-796 --format png --scale 2

# jq로 캔버스 목록만 추출
FIGMA_PERSONAL_ACCESS_TOKEN=figd_xxxxx node athometrip-planning/MCP/figma-cli.js file --key PuaTrGTcY3Q5OU7UFClAOo | jq '.document.children[] | {id: .id, name: .name, type: .type}'
```

### 4. 프로젝트 Figma 문서
- **신규 통합 기획문서**: `PuaTrGTcY3Q5OU7UFClAOo`
- **URL**: https://www.figma.com/design/PuaTrGTcY3Q5OU7UFClAOo/신규-통합기획문서
- **주요 캔버스**:
  - `337:796`: 공통, 헤더, GNB
  - `337:158`: 메인
  - `341:4857`: 티켓·투어
  - `341:3907`: 마이페이지
  - `341:3909`: 장바구니/결제

### 5. MCP 도구 사용 (Agent 모드)
Claude Code의 Agent 모드에서 Figma MCP 도구를 사용할 수 있습니다:

```
# 디자인 컨텍스트 가져오기
#get_design_context

# 현재 열린 Figma 파일의 정보 조회
#figma_get_file

# 특정 노드 정보 가져오기
#figma_get_nodes
```

### 6. 문제 해결

**"Missing FIGMA_PERSONAL_ACCESS_TOKEN" 에러**:
- `.env` 파일에 토큰이 있는지 확인
- CLI 실행 시 환경 변수를 명시적으로 전달

**"Failed to connect" (Desktop MCP)**:
- Figma Desktop 앱이 실행 중인지 확인
- Dev Mode에서 MCP 서버가 활성화되어 있는지 확인
- 포트 3845가 사용 가능한지 확인

**"Needs authentication" (Remote MCP)**:
- VSCode에서 MCP 설정 → Figma 서버 → Authenticate 클릭
- 브라우저에서 OAuth 인증 완료

## Jira 연동
### 1. 환경 변수
- 별도 토큰 없이 Confluence와 동일한 `ATLASSIAN_EMAIL`, `CONFLUENCE_API_TOKEN`을 그대로 사용.
- 필요 시 `JIRA_BASE_URL`을 `.env`에 추가해 기본 호스트(`https://athometrip.atlassian.net`)를 덮어쓸 수 있음.

### 2. CLI 사용법
- 스크립트: `athometrip-planning/MCP/jira-cli.js`
- 공통 옵션: 대부분 `--key`, `--project`, `--summary` 등 플래그 기반.
- Atlassian Document Format(ADF)이 필요한 필드는 `--body-file`로 JSON을 직접 넘기거나 `--description`/`--text` 같은 문자열 입력을 사용.

```bash
# 프로젝트 목록
node athometrip-planning/MCP/jira-cli.js projects --max 20

# 이슈 상세 조회
node athometrip-planning/MCP/jira-cli.js issue --key PRODUCT-123

# 이슈 검색 (JQL)
node athometrip-planning/MCP/jira-cli.js search --jql "project = PRODUCT ORDER BY updated DESC" --max 10

# 이슈 생성 (간단 텍스트 설명)
node athometrip-planning/MCP/jira-cli.js create \
  --project PRODUCT \
  --type Task \
  --summary "픽패스 API 에러 확인" \
  --description "dev 환경에서 500 발생. 로그 확인 필요."

# 전환 가능한 상태 조회
node athometrip-planning/MCP/jira-cli.js transitions --key PRODUCT-123

# 상태 전환
node athometrip-planning/MCP/jira-cli.js transition --key PRODUCT-123 --id 41

# 코멘트 추가
node athometrip-planning/MCP/jira-cli.js comment --key PRODUCT-123 --text "로그 확인 완료, 패치 준비 중입니다."
```

> 복잡한 페이로드가 필요하면 `sample-body.json` 패턴을 참고해 Atlas Doc Format 구조를 직접 작성한 뒤 `--body-file`로 전달하세요.
