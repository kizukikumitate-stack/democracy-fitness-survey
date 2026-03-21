import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SURVEYS_FILE = path.join(DATA_DIR, 'surveys.json');
const RESPONSES_DIR = path.join(DATA_DIR, 'responses');

export interface Survey {
  id: string;
  token: string;
  organizationName: string;
  createdAt: string;
}

export interface Response {
  id: string;
  respondentName: string;
  answers: Record<string, number>;
  createdAt: string;
}

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(RESPONSES_DIR)) {
    fs.mkdirSync(RESPONSES_DIR, { recursive: true });
  }
  if (!fs.existsSync(SURVEYS_FILE)) {
    fs.writeFileSync(SURVEYS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

export function getSurveys(): Survey[] {
  ensureDirectories();
  try {
    const content = fs.readFileSync(SURVEYS_FILE, 'utf-8');
    return JSON.parse(content) as Survey[];
  } catch {
    return [];
  }
}

export function getSurveyByToken(token: string): Survey | null {
  const surveys = getSurveys();
  return surveys.find(s => s.token === token) ?? null;
}

export function createSurvey(survey: Survey): void {
  ensureDirectories();
  const surveys = getSurveys();
  surveys.push(survey);
  fs.writeFileSync(SURVEYS_FILE, JSON.stringify(surveys, null, 2), 'utf-8');
}

export function getResponses(token: string): Response[] {
  ensureDirectories();
  const file = path.join(RESPONSES_DIR, `${token}.json`);
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    const content = fs.readFileSync(file, 'utf-8');
    return JSON.parse(content) as Response[];
  } catch {
    return [];
  }
}

export function addResponse(token: string, response: Response): void {
  ensureDirectories();
  const responses = getResponses(token);
  responses.push(response);
  const file = path.join(RESPONSES_DIR, `${token}.json`);
  fs.writeFileSync(file, JSON.stringify(responses, null, 2), 'utf-8');
}

export function getResponseCount(token: string): number {
  return getResponses(token).length;
}
