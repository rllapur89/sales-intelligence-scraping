import { Injectable } from '@angular/core';
import { Lead, LeadStatus, CompanySize, ScrapingStatus } from '../models/lead.model';
import { ScrapingJob, ScrapingSource, JobStatus } from '../models/scraping-job.model';
import { ActivityEvent, ChartPoint } from '../models/metrics.model';

const FIRST_NAMES = ['James','Maria','Carlos','Sarah','Alex','Elena','John','Priya','David','Sofia',
  'Michael','Yuki','Robert','Aisha','William','Nina','Thomas','Laura','Chris','Mei',
  'Daniel','Anna','Kevin','Rachel','Mark','Sandra','Jason','Monica','Brian','Claire'];
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','García','Miller','Davis','Wilson',
  'Anderson','Taylor','Thomas','Jackson','White','Harris','Martin','Thompson','Lee',
  'Walker','Hall','Allen','Young','Hernández','King','Wright','López','Hill','Scott'];
const COMPANIES = ['TechNova','Apex Systems','CloudForge','DataStream Inc','NexGen Solutions',
  'Vertex Corp','InnovateCo','Synergy Digital','PivotPoint','AlphaStack',
  'Meridian Labs','CoreLogic','SkyBridge Tech','Quantum Analytics','BlueShift',
  'Orion Ventures','ClearPath AI','FrontierSoft','Elevation Works','TrueScale',
  'RapidGrid','Momentum Tech','LiftOff Digital','Circadian','Starflow',
  'PulseMetrics','NorthStar Data','EchoSystems','BrightPath','Vantage Point'];
const INDUSTRIES = ['Technology','Healthcare','Finance','Retail','Manufacturing','Education',
  'Real Estate','Legal','Marketing','Consulting','Energy','Logistics'];
const COUNTRIES = ['United States','United Kingdom','Canada','Germany','Australia','France',
  'Netherlands','Spain','Brazil','Mexico','India','Singapore'];
const ROLES = ['CEO','CTO','VP Sales','Head of Marketing','Product Manager','Engineering Manager',
  'Director of Operations','Chief Revenue Officer','VP Engineering','CMO',
  'Head of Growth','Sales Director','Account Executive','Business Developer'];
const SENIORITIES: Lead['seniority'][] = ['c-level','vp','director','manager','individual'];
const TECH_STACKS = ['React','Angular','Vue','Node.js','Python','AWS','Azure','GCP','Kubernetes',
  'PostgreSQL','MongoDB','Redis','Docker','Terraform','TypeScript'];
const TEAM_MEMBERS = ['Alice Cooper','Bob Martinez','Carol White','David Chen','Emma Wilson'];
const SOURCES: ScrapingSource[] = ['linkedin','company-website','industry-directory','crunchbase','github'];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function uuid(): string { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function generateLead(index: number): Lead {
  const firstName = rand(FIRST_NAMES);
  const lastName = rand(LAST_NAMES);
  const company = rand(COMPANIES);
  const seniority = rand(SENIORITIES);
  const statuses: LeadStatus[] = ['new','contacted','qualified','proposal','won','lost'];
  const scrapingStatuses: ScrapingStatus[] = ['updated','updated','updated','stale','validating'];
  const sizes: CompanySize[] = ['startup','smb','mid-market','enterprise'];

  return {
    id: `lead-${index}-${uuid()}`,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company.toLowerCase().replace(/\s+/g,'-')}.com`,
    phone: `+1 (${randInt(200,999)}) ${randInt(100,999)}-${randInt(1000,9999)}`,
    company,
    companySize: rand(sizes),
    industry: rand(INDUSTRIES),
    country: rand(COUNTRIES),
    city: ['New York','London','Toronto','Berlin','Sydney','Paris'][randInt(0,5)],
    role: rand(ROLES),
    seniority,
    linkedinUrl: `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`,
    websiteUrl: `https://www.${company.toLowerCase().replace(/\s+/g,'-')}.com`,
    score: randInt(40, 100),
    status: rand(statuses),
    scrapingStatus: rand(scrapingStatuses),
    estimatedValue: randInt(5000, 250000),
    lastScraped: new Date(Date.now() - randInt(0, 7 * 24 * 3600 * 1000)),
    createdAt: new Date(Date.now() - randInt(0, 30 * 24 * 3600 * 1000)),
    tags: [rand(INDUSTRIES), rand(['hot','warm','cold'])].filter(Boolean),
    assignedTo: Math.random() > 0.3 ? rand(TEAM_MEMBERS) : undefined,
    techStack: Array.from({ length: randInt(1, 4) }, () => rand(TECH_STACKS)),
  };
}

function generateJob(index: number): ScrapingJob {
  const statuses: JobStatus[] = ['queued','running','running','completed','completed','failed'];
  const status = rand(statuses);
  const progress = status === 'completed' ? 100 : status === 'running' ? randInt(5,95) : status === 'failed' ? randInt(10,60) : 0;
  const sources: ScrapingSource[] = ['linkedin','company-website','industry-directory','crunchbase','github'];

  return {
    id: `job-${index}-${uuid()}`,
    name: `${rand(INDUSTRIES)} ${rand(['LinkedIn','Web','Directory'])} Scrape`,
    source: rand(sources),
    targetUrl: `https://www.${rand(['linkedin','example','industry-db'])}.com/search`,
    depth: randInt(1, 4),
    status,
    progress,
    leadsFound: randInt(10, 5000),
    leadsTarget: randInt(500, 10000),
    errorCount: randInt(0, 50),
    startedAt: status !== 'queued' ? new Date(Date.now() - randInt(60000, 3600000)) : undefined,
    completedAt: status === 'completed' || status === 'failed' ? new Date(Date.now() - randInt(0, 1800000)) : undefined,
    createdAt: new Date(Date.now() - randInt(0, 7 * 24 * 3600 * 1000)),
    filters: { industries: [rand(INDUSTRIES)], countries: [rand(COUNTRIES)] },
    priority: rand(['low','normal','high']),
    estimatedDuration: randInt(5, 120),
  };
}

@Injectable({ providedIn: 'root' })
export class MockDataService {
  private readonly _leads: Lead[] = Array.from({ length: 1200 }, (_, i) => generateLead(i));
  private readonly _jobs: ScrapingJob[] = Array.from({ length: 24 }, (_, i) => generateJob(i));

  getLeads(): Lead[] { return this._leads; }
  getJobs(): ScrapingJob[] { return this._jobs; }

  getActiveJobs(): ScrapingJob[] {
    return this._jobs.filter(j => j.status === 'running' || j.status === 'queued');
  }

  getRecentActivity(): ActivityEvent[] {
    return Array.from({ length: 40 }, (_, i): ActivityEvent => {
      const types: ActivityEvent['type'][] = ['lead_found','lead_found','job_started','job_completed','job_failed'];
      const type = rand(types);
      const msgs: Record<ActivityEvent['type'], string> = {
        lead_found: `Found ${randInt(5,150)} leads from ${rand(COMPANIES)}`,
        job_started: `Job "${rand(INDUSTRIES)} Scrape" started`,
        job_completed: `Job "${rand(INDUSTRIES)} Scrape" completed with ${randInt(100,5000)} leads`,
        job_failed: `Job "${rand(INDUSTRIES)} Scrape" failed at ${randInt(10,80)}%`,
        export: `Exported ${randInt(100,5000)} leads to CSV`,
      };
      return {
        id: `evt-${i}`,
        type,
        message: msgs[type],
        timestamp: new Date(Date.now() - i * randInt(30000, 300000)),
        meta: { count: randInt(5, 5000) },
      };
    });
  }

  getHourlyChart(): ChartPoint[] {
    return Array.from({ length: 24 }, (_, i) => ({
      label: `${String(i).padStart(2,'0')}:00`,
      value: randInt(0, 800),
    }));
  }

  getDailyChart(): ChartPoint[] {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 24 * 3600 * 1000);
      return { label: d.toLocaleDateString('en',{month:'short',day:'numeric'}), value: randInt(50, 1200) };
    });
  }

  getIndustryChart(): ChartPoint[] {
    return INDUSTRIES.map(ind => ({
      label: ind,
      value: this._leads.filter(l => l.industry === ind).length,
    })).sort((a, b) => b.value - a.value);
  }

  getTopCompanies(): ChartPoint[] {
    const map = new Map<string, number>();
    this._leads.forEach(l => map.set(l.company, (map.get(l.company) ?? 0) + 1));
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value }));
  }

  getIndustries(): string[] { return INDUSTRIES; }
  getCountries(): string[] { return COUNTRIES; }
  getTeamMembers(): string[] { return TEAM_MEMBERS; }

  updateJobProgress(job: ScrapingJob): ScrapingJob {
    const newProgress = Math.min(100, job.progress + randInt(1, 8));
    const done = newProgress >= 100;
    return {
      ...job,
      progress: newProgress,
      leadsFound: job.leadsFound + randInt(5, 80),
      errorCount: job.errorCount + (Math.random() > 0.9 ? 1 : 0),
      status: done ? 'completed' : 'running',
      completedAt: done ? new Date() : undefined,
    };
  }

  generateNewLead(): Lead { return generateLead(this._leads.length + randInt(0, 9999)); }
}
