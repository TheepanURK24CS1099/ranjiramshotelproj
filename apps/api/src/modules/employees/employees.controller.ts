import type { Request, Response, NextFunction } from "express";
import * as employeesService from "./employees.service.js";
import { createEmployeeSchema, updateEmployeeSchema, updateEmployeeStatusSchema, assignShiftSchema } from "./employees.schema.js";

export async function getEmployees(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page?.toString() || "1", 10);
    const limit = parseInt(req.query.limit?.toString() || "20", 10);
    const search = req.query.search?.toString();
    const active = req.query.active !== undefined ? req.query.active === "true" : undefined;

    const options: Parameters<typeof employeesService.getEmployees>[0] = { page, limit };
    if (search !== undefined) options.search = search;
    if (active !== undefined) options.active = active;
    const result = await employeesService.getEmployees(options);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getEmployeeById(req: Request, res: Response, next: NextFunction) {
  try {
    const employee = await employeesService.getEmployeeById(req.params.id as string);
    if (!employee) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }
    res.json(employee);
  } catch (error) {
    next(error);
  }
}

export async function createEmployee(req: Request, res: Response, next: NextFunction) {
  try {
    const validationResult = createEmployeeSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ message: "Validation failed", errors: validationResult.error.issues });
      return;
    }

    const { initial_shift, ...employeeData } = validationResult.data;

    // Explicit typing for mapped object to align with repository signature
    const newEmployee = await employeesService.createEmployee(employeeData as unknown as Parameters<typeof employeesService.createEmployee>[0], initial_shift);
    res.status(201).json(newEmployee);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Conflict:")) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
}

export async function updateEmployee(req: Request, res: Response, next: NextFunction) {
  try {
    const validationResult = updateEmployeeSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ message: "Validation failed", errors: validationResult.error.issues });
      return;
    }

    const employee = await employeesService.updateEmployee(req.params.id as string, validationResult.data as unknown as Parameters<typeof employeesService.updateEmployee>[1]);
    if (!employee) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }
    res.json(employee);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Conflict:")) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
}

export async function updateEmployeeStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const validationResult = updateEmployeeStatusSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ message: "Validation failed", errors: validationResult.error.issues });
      return;
    }

    const employee = await employeesService.updateEmployeeStatus(req.params.id as string, validationResult.data.active);
    if (!employee) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }
    res.json(employee);
  } catch (error) {
    next(error);
  }
}

export async function getEmployeeShiftAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const assignments = await employeesService.getEmployeeShiftAssignments(req.params.id as string);
    res.json(assignments);
  } catch (error) {
    next(error);
  }
}

export async function assignShift(req: Request, res: Response, next: NextFunction) {
  try {
    const validationResult = assignShiftSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ message: "Validation failed", errors: validationResult.error.issues });
      return;
    }

    const assignment = await employeesService.assignShift(req.params.id as string, validationResult.data.shift_id, validationResult.data.effective_from);
    res.status(201).json(assignment);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Conflict:")) {
      res.status(409).json({ message: error.message });
      return;
    }
    if (error instanceof Error && error.message.startsWith("Not Found:")) {
      res.status(404).json({ message: error.message });
      return;
    }
    next(error);
  }
}
