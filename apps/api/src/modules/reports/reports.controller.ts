import { Buffer } from "node:buffer";
import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
import * as reports from "./reports.service.js";
import type { ReportName } from "./reports.service.js";

const names = new Set<ReportName>(["attendance-summary", "payroll-summary", "salary-history", "advances", "device-logs", "raw-punches", "attendance-exceptions", "unmatched-biometrics"]);
const financial = /(?:salary|pay|deduction|recovery|amount|balance|additions|gross|net)/iu;
function name(req: Request): ReportName { const value=req.params.report as ReportName; if(!names.has(value)) throw new Error("Not Found: report"); return value; }
function error(res:Response,e:unknown) { const text=e instanceof Error?e.message:"Report failed"; res.status(text.startsWith("Not Found")?404:400).json({message:text.replace(/^Validation: /u,"")}); }

function label(key:string) {
  if (key === "employee_code") return "Employee ID";
  if (key === "total_working_days") return "Total Days";
  if (key === "present_days") return "Present";
  if (key === "absent_days") return "Absent";
  if (key === "shift1_summary" || key === "shift1") return "Shift 1";
  if (key === "shift2_summary" || key === "shift2") return "Shift 2";
  if (key === "shift1_status") return "Shift 1 Status";
  if (key === "shift2_status") return "Shift 2 Status";
  if (key === "worked_duration") return "Working Hours";
  if (key === "notes" || key === "remarks") return "Remarks";
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function csv(rows:Record<string,unknown>[], customKeys?: string[], useLabels = true) {
  const keys = customKeys ?? Object.keys(rows[0]??{}).filter(key=>key!=="employee_id" && key !== "shift");
  const cell=(v:unknown)=>`"${String(v??"").replaceAll('"','""')}"`;
  const headers = useLabels ? keys.map(k=>label(k)) : keys;
  return `\uFEFF${headers.join(',')}\r\n${rows.map(row=>keys.map(k=>cell(row[k])).join(',')).join('\r\n')}\r\n`;
}

function minutes(raw:unknown){const value=Number(raw);if(!Number.isFinite(value))return "0m";const hours=Math.floor(value/60),rest=Math.abs(value%60);return hours?`${hours}h ${String(rest).padStart(2,"0")}m`:`${rest}m`;}
function value(key:string, raw:unknown) { if (raw === null || raw === undefined) return "—"; if (typeof raw === "boolean") return raw ? "Active" : "Inactive"; if (/(?:minutes|overtime)/iu.test(key) && /^-?\d+(\.\d+)?$/u.test(String(raw))) return minutes(raw); if (financial.test(key) && /^-?\d+(\.\d+)?$/u.test(String(raw))) return `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(raw))}`; return String(raw).replaceAll("_", " "); }
function filterText(query:Request["query"]) { const selected=Object.entries(query).filter(([key,value])=>!['page','limit'].includes(key)&&typeof value==='string'&&value).map(([key,value])=>`${label(key)}: ${value}`); return selected.length ? selected.join(" • ") : "All records"; }

function pdf(title:string, rows:Record<string,unknown>[], query:Request["query"], reportName?: ReportName) {
  const document=new PDFDocument({layout:"landscape",size:"A4",margin:30,bufferPages:true});const chunks:Buffer[]=[];document.on("data",(chunk:Buffer)=>chunks.push(chunk));
  const isAttendanceSummary = reportName === "attendance-summary" || title.toLowerCase() === "attendance summary";
  const columns=isAttendanceSummary ? ["employee", "employee_code", "present_days", "absent_days", "shift1_summary", "shift2_summary"] : Object.keys(rows[0]??{}).filter(key=>key!=="employee_id");
  const left=30,right=30,generated=new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeZone:"Asia/Kolkata"}).format(new Date());let y=0;
  const colWidth = (index: number) => { if (!isAttendanceSummary) return (document.page.width - left - right) / Math.max(1, columns.length); const widths = [180, 110, 110, 110, 135, 135]; return widths[index] ?? (document.page.width - left - right) / columns.length; };
  const isNumeric = (col: string) => /(?:minutes|days|count|amount|salary|pay|balance|overtime)/iu.test(col);
  const header=()=>{document.font("Helvetica-Bold").fontSize(12).fillColor("#12304A").text("RANJI RAMS HOTEL",left,28);document.fontSize(8).text("Hotel Management System",left,44);document.fontSize(11).text(`${title} Report`,left,57);document.font("Helvetica").fontSize(7).fillColor("#444").text(`Filters: ${filterText(query)}`,left,73,{width:document.page.width-left-right});document.text(`Generated (IST): ${generated}`,left,84);document.moveTo(left,97).lineTo(document.page.width-right,97).strokeColor("#2C5D7B").stroke();let x=left;document.fillColor("#12304A").font("Helvetica-Bold").fontSize(7);columns.forEach((column,index)=>{const width=colWidth(index);document.text(label(column),x,104,{width:width-3,height:14,ellipsis:true,align:isNumeric(column)?"right":"left"});x+=width;});document.moveTo(left,120).lineTo(document.page.width-right,120).strokeColor("#999").stroke();document.font("Helvetica").fillColor("#111");y=124;};header();
  if(!rows.length)document.text("No matching records.",left,y);for(const row of rows){const cells=columns.map(column=>{const cellVal=column==="overtime"?(row.overtime_minutes??row.overtime??row.overtime_hours??0):row[column];return value(column,cellVal);});const height=Math.max(18,...cells.map((cell,index)=>document.heightOfString(cell,{width:colWidth(index)-4})))+6;if(y+height>document.page.height-38){document.addPage();header();}let x=left;cells.forEach((cell,index)=>{const width=colWidth(index);document.text(cell,x,y+3,{width:width-4,height:height-4,align:isNumeric(columns[index]!)?"right":"left"});x+=width;});document.moveTo(left,y+height).lineTo(document.page.width-right,y+height).strokeColor("#ddd").stroke();y+=height;}
  const range=document.bufferedPageRange();for(let page=0;page<range.count;page+=1){document.switchToPage(page);document.fillColor("#444").fontSize(7).text(`RANJI RAMS HOTEL • Page ${page+1} of ${range.count}`,left,document.page.height-24,{width:document.page.width-left-right,align:"right"});}document.end();return new Promise<Buffer>((resolve,reject)=>{document.on("end",()=>resolve(Buffer.concat(chunks)));document.on("error",reject);});
}

function employeePdf(data: any, query: Request["query"]) {
  const document = new PDFDocument({ layout: "portrait", size: "A4", margin: 30, bufferPages: true });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const left = 30, right = 30, generated = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date());
  let y = 0;
  const emp = data.employee || {};
  const summary = data.summary || {};
  const s1 = summary.shift1Summary || {};
  const s2 = summary.shift2Summary || {};
  const items = data.items || [];

  const header = () => {
    document.font("Helvetica-Bold").fontSize(12).fillColor("#12304A").text("RANJI RAMS HOTEL", left, 28);
    document.fontSize(8).text("Hotel Management System", left, 44);
    document.fontSize(11).text(`Individual Attendance Report – ${emp.name || ''}`, left, 57);
    document.font("Helvetica").fontSize(7).fillColor("#444").text(`Period: ${query.fromDate || ''} to ${query.toDate || ''}`, left, 73);
    document.text(`Generated (IST): ${generated}`, left, 84);
    document.moveTo(left, 97).lineTo(document.page.width - right, 97).strokeColor("#2C5D7B").stroke();
    y = 104;
  };
  header();

  // Employee Information Box
  document.font("Helvetica-Bold").fontSize(9).fillColor("#12304A").text("Employee Information", left, y);
  y += 14;
  document.font("Helvetica").fontSize(8).fillColor("#333");
  document.text(`Code: ${emp.employee_code || '—'}  |  Biometric ID: ${emp.biometric_id || '—'}  |  Shift: ${emp.current_shift || '—'}  |  Status: ${emp.active ? 'Active' : 'Inactive'}`, left, y);
  y += 18;

  // Top Summary Cards
  document.font("Helvetica-Bold").fontSize(9).fillColor("#12304A").text("Period Summary", left, y);
  y += 14;
  document.font("Helvetica").fontSize(8).fillColor("#333");
  document.text(`Total Days: ${summary.totalWorkingDays ?? 0}  |  Present: ${summary.presentDays ?? 0}  |  Absent: ${summary.absentDays ?? 0}  |  Shift 1: ${summary.shift1 || '0 / 0'}  |  Shift 2: ${summary.shift2 || '0 / 0'}`, left, y);
  y += 20;

  // Shift 1 Summary Section
  document.font("Helvetica-Bold").fontSize(9).fillColor("#028174").text(`Shift 1 Summary (Completed / Expected: ${summary.shift1 || '0 / 0'})`, left, y);
  y += 14;
  document.font("Helvetica").fontSize(7.5).fillColor("#333");
  document.text(`Present: ${s1.present ?? 0}  |  Late: ${s1.late ?? 0}  |  Early Exit: ${s1.earlyExit ?? 0}  |  Absent: ${s1.absent ?? 0}  |  Half Day: ${s1.halfDay ?? 0}  |  Check-in Missing: ${s1.checkinMissing ?? 0}  |  Check-out Missing: ${s1.checkoutMissing ?? 0}  |  Pending: ${s1.pending ?? 0}`, left, y);
  y += 20;

  // Shift 2 Summary Section
  document.font("Helvetica-Bold").fontSize(9).fillColor("#028174").text(`Shift 2 Summary (Completed / Expected: ${summary.shift2 || '0 / 0'})`, left, y);
  y += 14;
  document.font("Helvetica").fontSize(7.5).fillColor("#333");
  document.text(`Present: ${s2.present ?? 0}  |  Late: ${s2.late ?? 0}  |  Early Exit: ${s2.earlyExit ?? 0}  |  Absent: ${s2.absent ?? 0}  |  Half Day: ${s2.halfDay ?? 0}  |  Check-in Missing: ${s2.checkinMissing ?? 0}  |  Check-out Missing: ${s2.checkoutMissing ?? 0}  |  Pending: ${s2.pending ?? 0}`, left, y);
  y += 24;

  // Daily Breakdown Table Header
  document.font("Helvetica-Bold").fontSize(9).fillColor("#12304A").text("Daily Breakdown", left, y);
  y += 16;

  const cols = ["Date", "Shift 1 Status", "Shift 2 Status", "Working Hours", "Remarks"];
  const widths = [90, 110, 110, 85, 140];
  document.font("Helvetica-Bold").fontSize(7.5).fillColor("#12304A");
  let x = left;
  cols.forEach((col, i) => {
    const width = widths[i] ?? 0;
    document.text(col, x, y, { width: width - 4 });
    x += width;
  });
  y += 14;
  document.moveTo(left, y).lineTo(document.page.width - right, y).strokeColor("#999").stroke();
  y += 6;

  document.font("Helvetica").fontSize(7.5).fillColor("#111");
  for (const item of items) {
    if (y + 18 > document.page.height - 38) {
      document.addPage();
      header();
      document.font("Helvetica-Bold").fontSize(7.5).fillColor("#12304A");
      let cx = left;
      cols.forEach((col, i) => {
        const width = widths[i] ?? 0;
        document.text(col, cx, y, { width: width - 4 });
        cx += width;
      });
      y += 14;
      document.moveTo(left, y).lineTo(document.page.width - right, y).strokeColor("#999").stroke();
      y += 6;
      document.font("Helvetica").fontSize(7.5).fillColor("#111");
    }
    let rx = left;
    const w0 = widths[0] ?? 0;
    const w1 = widths[1] ?? 0;
    const w2 = widths[2] ?? 0;
    const w3 = widths[3] ?? 0;
    const w4 = widths[4] ?? 0;
    document.text(String(item.date || '—'), rx, y, { width: w0 - 4 }); rx += w0;
    document.text(String(item.shift1_status || '—'), rx, y, { width: w1 - 4 }); rx += w1;
    document.text(String(item.shift2_status || '—'), rx, y, { width: w2 - 4 }); rx += w2;
    document.text(String(item.worked_duration || '—'), rx, y, { width: w3 - 4 }); rx += w3;
    document.text(String(item.remarks || item.notes || '—'), rx, y, { width: w4 - 4, ellipsis: true });
    y += 16;
    document.moveTo(left, y).lineTo(document.page.width - right, y).strokeColor("#eee").stroke();
    y += 4;
  }

  const range = document.bufferedPageRange();
  for (let page = 0; page < range.count; page += 1) {
    document.switchToPage(page);
    document.fillColor("#444").fontSize(7).text(`RANJI RAMS HOTEL • Page ${page + 1} of ${range.count}`, left, document.page.height - 24, { width: document.page.width - left - right, align: "right" });
  }
  document.end();
  return new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
}

export async function get(req:Request,res:Response){try{res.json(await reports.report(name(req),req.query));}catch(e){error(res,e)}}
export async function exportReport(req:Request,res:Response){try{const report=await reports.report(name(req),{...req.query,page:1,limit:100});const title=name(req).replaceAll('-',' ');const keys=name(req)==='attendance-summary'?["employee","employee_code","present_days","absent_days","shift1_summary","shift2_summary"]:undefined;if(req.params.format==='csv')res.type('text/csv; charset=utf-8').attachment(`${name(req)}.csv`).send(csv(report.items as Record<string,unknown>[],keys,true));else res.type('application/pdf').set('Content-Disposition',`inline; filename=${name(req)}.pdf`).send(await pdf(title,report.items as Record<string,unknown>[],req.query,name(req)));}catch(e){error(res,e)}}

export async function getEmployeeAttendance(req:Request,res:Response){try{res.json(await reports.employeeAttendanceDetail(String(req.params.employeeId??''),req.query));}catch(e){error(res,e)}}
export async function exportEmployeeAttendance(req:Request,res:Response){try{const empId=String(req.params.employeeId??'');const data=await reports.employeeAttendanceDetail(empId,{...req.query,page:1,limit:366});const emp=data.employee as Record<string,unknown>;if(req.params.format==='csv')res.type('text/csv; charset=utf-8').attachment(`attendance-${empId}.csv`).send(csv(data.items as Record<string,unknown>[], ["date", "attendance_status", "shift1_status", "shift2_status", "worked_duration", "remarks"], false));else res.type('application/pdf').set('Content-Disposition',`inline; filename=attendance-${empId}.pdf`).send(await employeePdf(data,req.query));}catch(e){error(res,e)}}
