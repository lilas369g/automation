/**
 * ESTIMATION ENGINE - FPA & UCP Software Project Estimation
 * 
 * This module provides:
 * - JSON Schema for estimation sessions
 * - Complexity Weight Mapping Logic
 * - FPA & UCP Calculation Engine
 * - PDF Report Generation
 */

// ════════════════════════════════════════════════════════════════
// SECTION 1: JSON SCHEMA (Session Data Structure)
// ════════════════════════════════════════════════════════════════

export function createEmptyEstimationSession() {
  return {
    sessionId: generateSessionId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    
    // PROJECT METADATA
    project: {
      name: "",
      description: "",
      teamSize: 0,
      hourlyRate: 0,
      currency: "USD",
      method: "BOTH" // "FPA" | "UCP" | "BOTH"
    },

    // FUNCTION POINT ANALYSIS DATA
    FPA: {
      elements: {
        EI: [
          // { id: "ei_1", name: "User Registration", complexity: "Average", weight: 4 }
        ],
        EO: [],
        EQ: [],
        ILF: [],
        EIF: []
      },
      
      // General System Characteristics (14 factors, 0-5 rating each)
      GSC: {
        F1: 0, // Data Communications
        F2: 0, // Distributed Processing
        F3: 0, // Performance
        F4: 0, // Heavily Used Configuration
        F5: 0, // Transaction Rate
        F6: 0, // Online Data Entry
        F7: 0, // End-User Efficiency
        F8: 0, // Online Update
        F9: 0, // Complex Processing
        F10: 0, // Reusability
        F11: 0, // Installation Ease
        F12: 0, // Operational Ease
        F13: 0, // Multiple Sites
        F14: 0  // Facilitate Change
      },
      
      // Calculated values
      UFP: 0,        // Unadjusted Function Points
      sumF: 0,       // Sum of GSC ratings
      VAF: 0.65,     // Value Adjustment Factor (0.65 + 0.01 * sumF)
      FP: 0,         // Adjusted Function Points
      hoursPerFP: 8, // Productivity factor (customizable)
      effortHours: 0,
      cost: 0
    },

    // USE CASE POINT ANALYSIS DATA
    UCP: {
      actors: [
        // { id: "a_1", name: "End User", type: "human", weight: 3 }
      ],
      UAW: 0, // Unadjusted Actor Weight
      
      useCases: [
        // { id: "uc_1", name: "Login", complexity: "Simple", weight: 5 }
      ],
      UUCW: 0, // Unadjusted Use Case Weight
      UUCP: 0, // Unadjusted Use Case Points
      
      // Technical Complexity Factors (13 factors, 0-5 rating each)
      TCF_factors: {
        T1: 0,  // Distributed System (weight: 2)
        T2: 0,  // Performance (weight: 1)
        T3: 0,  // End-User Efficiency (weight: 1)
        T4: 0,  // Complex Internal Processing (weight: 1)
        T5: 0,  // Reusability (weight: 1)
        T6: 0,  // Installability (weight: 0.5)
        T7: 0,  // Usability (weight: 0.5)
        T8: 0,  // Portability (weight: 2)
        T9: 0,  // Modifiability (weight: 1)
        T10: 0, // Concurrency (weight: 1)
        T11: 0, // Special Security (weight: 1)
        T12: 0, // Third-Party Access (weight: 1)
        T13: 0  // Special User Training (weight: 1)
      },
      TFactor: 0,
      TCF: 0.6, // Technical Complexity Factor (0.6 + 0.01 * TFactor)
      
      // Environmental Complexity Factors (8 factors, 0-5 rating each)
      ECF_factors: {
        E1: 0, // Familiarity with Process (weight: 1.5)
        E2: 0, // App Experience (weight: 0.5)
        E3: 0, // OO Experience (weight: 1)
        E4: 0, // Analyst Capability (weight: 0.5)
        E5: 0, // Team Motivation (weight: 1)
        E6: 0, // Requirements Stability (weight: 2)
        E7: 0, // Part-Time Workers (weight: -1)
        E8: 0  // Difficult Language (weight: -1)
      },
      EFactor: 0,
      ECF: 1.4, // Environmental Complexity Factor (1.4 - 0.03 * EFactor)
      
      UCP: 0,        // Adjusted Use Case Points
      PF: 20,        // Productivity Factor (hours per UCP, default 20)
      effortHours: 0,
      cost: 0
    },

    // COMBINED RESULTS
    summary: {
      fpaEffortHours: 0,
      fpaEffortDays: 0,  // Assuming 8h/day
      fpaCost: 0,
      
      ucpEffortHours: 0,
      ucpEffortDays: 0,
      ucpCost: 0,
      
      combinedEffortHours: 0,
      combinedEffortDays: 0,
      combinedCost: 0,
      
      projectSizeLabel: "",        // Small/Medium/Large/Very Large
      complexityLabel: "",          // Low/Medium/High/Very High
      confidenceNote: ""
    }
  };
}

// ════════════════════════════════════════════════════════════════
// SECTION 2: COMPLEXITY WEIGHT MAPPING
// ════════════════════════════════════════════════════════════════

/**
 * FPA Complexity Weights
 * Standard IFPUG (International Function Point Users Group) weights
 */
export const FPA_WEIGHTS = {
  EI: {
    Simple: 3,
    Average: 4,
    Complex: 6
  },
  EO: {
    Simple: 4,
    Average: 5,
    Complex: 7
  },
  EQ: {
    Simple: 3,
    Average: 4,
    Complex: 6
  },
  ILF: {
    Simple: 7,
    Average: 10,
    Complex: 15
  },
  EIF: {
    Simple: 5,
    Average: 7,
    Complex: 10
  }
};

/**
 * UCP Complexity Weights
 */
export const UCP_WEIGHTS = {
  actor: {
    Simple: 1,   // Machine-to-machine, defined API
    Average: 2,  // System via protocol (HTTP, FTP, etc.)
    Complex: 3   // Human via GUI
  },
  useCase: {
    Simple: 5,   // <3 transactions, 1 table, <5 classes
    Average: 10, // 4-7 transactions, 2 tables, 5-10 classes
    Complex: 15  // >7 transactions, 3+ tables, >10 classes
  }
};

/**
 * TCF (Technical Complexity Factor) Weights
 */
export const TCF_WEIGHTS = {
  T1: 2,    // Distributed System
  T2: 1,    // Performance
  T3: 1,    // End-User Efficiency
  T4: 1,    // Complex Internal Processing
  T5: 1,    // Reusability
  T6: 0.5,  // Installability
  T7: 0.5,  // Usability
  T8: 2,    // Portability
  T9: 1,    // Modifiability
  T10: 1,   // Concurrency
  T11: 1,   // Special Security
  T12: 1,   // Third-Party Access
  T13: 1    // Special User Training
};

/**
 * ECF (Environmental Complexity Factor) Weights
 */
export const ECF_WEIGHTS = {
  E1: 1.5,  // Familiarity with Process
  E2: 0.5,  // App Experience
  E3: 1,    // OO Experience
  E4: 0.5,  // Analyst Capability
  E5: 1,    // Team Motivation
  E6: 2,    // Requirements Stability
  E7: -1,   // Part-Time Workers
  E8: -1    // Difficult Language
};

/**
 * Classify FPA element complexity based on description
 * Uses heuristics: data field count, business logic complexity, entity relationships
 */
export function classifyFPAComplexity(elementType, description) {
  const lower = description.toLowerCase();
  
  // Count indicators
  const fieldCount = (description.match(/field|attribute|input|output|column/gi) || []).length;
  const logicKeywords = (description.match(/validation|calculation|rule|condition|formula|aggregate/gi) || []).length;
  const relationKeywords = (description.match(/join|link|cross|integrate|relation|entity|multiple/gi) || []).length;
  
  const score = fieldCount + (logicKeywords * 1.5) + (relationKeywords * 1.2);
  
  // Element-specific heuristics
  if (elementType === "EI" || elementType === "EO") {
    if (score > 12) return "Complex";
    if (score > 6) return "Average";
    return "Simple";
  }
  
  if (elementType === "EQ") {
    if (logicKeywords > 3 || relationKeywords > 2) return "Complex";
    if (logicKeywords > 1 || relationKeywords > 0) return "Average";
    return "Simple";
  }
  
  if (elementType === "ILF" || elementType === "EIF") {
    if (score > 15) return "Complex";
    if (score > 8) return "Average";
    return "Simple";
  }
  
  return "Average";
}

/**
 * Map complexity string to numeric weight
 */
export function getComplexityWeight(elementType, complexity) {
  const weights = FPA_WEIGHTS[elementType];
  if (!weights) return 0;
  return weights[complexity] || weights.Average;
}

/**
 * Classify UCP actor complexity
 */
export function classifyActorComplexity(description) {
  const lower = description.toLowerCase();
  
  if (lower.includes("human") || lower.includes("user") || lower.includes("person") || lower.includes("gui")) {
    return "Complex"; // Human via GUI = 3
  }
  
  if (lower.includes("api") || lower.includes("system") || lower.includes("service")) {
    return "Average"; // System via protocol = 2
  }
  
  // Default to system-to-system with API
  return "Simple"; // Machine-to-machine = 1
}

/**
 * Classify UCP use case complexity
 */
export function classifyUseCaseComplexity(description) {
  const lower = description.toLowerCase();
  const stepCount = (description.match(/step|screen|transaction|page/gi) || []).length;
  const keywords = (description.match(/complex|multi|loop|branch|condition|rule/gi) || []).length;
  
  const score = stepCount + (keywords * 1.5);
  
  if (score > 7) return "Complex"; // >7 transactions
  if (score > 4) return "Average"; // 4-7 transactions
  return "Simple"; // <3 transactions
}

// ════════════════════════════════════════════════════════════════
// SECTION 3: CALCULATION ENGINE
// ════════════════════════════════════════════════════════════════

/**
 * Calculate FPA (Function Point Analysis)
 */
export function calculateFPA(session) {
  const fpa = session.FPA;
  
  // 1. Calculate UFP (Unadjusted Function Points)
  let UFP = 0;
  
  Object.keys(fpa.elements).forEach(elementType => {
    fpa.elements[elementType].forEach(element => {
      const weight = element.weight || getComplexityWeight(elementType, element.complexity);
      UFP += weight;
    });
  });
  
  fpa.UFP = UFP;
  
  // 2. Calculate sum of GSC factors
  const sumF = Object.values(fpa.GSC).reduce((sum, val) => sum + (val || 0), 0);
  fpa.sumF = sumF;
  
  // 3. Calculate VAF (Value Adjustment Factor)
  fpa.VAF = 0.65 + (0.01 * sumF);
  
  // 4. Calculate FP (Adjusted Function Points)
  fpa.FP = UFP * fpa.VAF;
  
  // 5. Calculate effort in hours
  fpa.effortHours = fpa.FP * fpa.hoursPerFP;
  
  // 6. Calculate cost
  fpa.cost = fpa.effortHours * session.project.hourlyRate;
  
  return fpa;
}

/**
 * Calculate UCP (Use Case Point Analysis)
 */
export function calculateUCP(session) {
  const ucp = session.UCP;
  
  // 1. Calculate UAW (Unadjusted Actor Weight)
  let UAW = 0;
  ucp.actors.forEach(actor => {
    const weight = actor.weight || UCP_WEIGHTS.actor[actor.complexity] || 2;
    UAW += weight;
  });
  ucp.UAW = UAW;
  
  // 2. Calculate UUCW (Unadjusted Use Case Weight)
  let UUCW = 0;
  ucp.useCases.forEach(uc => {
    const weight = uc.weight || UCP_WEIGHTS.useCase[uc.complexity] || 10;
    UUCW += weight;
  });
  ucp.UUCW = UUCW;
  
  // 3. Calculate UUCP (Unadjusted Use Case Points)
  ucp.UUCP = UAW + UUCW;
  
  // 4. Calculate TCF (Technical Complexity Factor)
  let TFactor = 0;
  Object.keys(ucp.TCF_factors).forEach(factor => {
    const rating = ucp.TCF_factors[factor] || 0;
    const weight = TCF_WEIGHTS[factor] || 1;
    TFactor += rating * weight;
  });
  ucp.TFactor = TFactor;
  ucp.TCF = 0.6 + (0.01 * TFactor);
  
  // 5. Calculate ECF (Environmental Complexity Factor)
  let EFactor = 0;
  Object.keys(ucp.ECF_factors).forEach(factor => {
    const rating = ucp.ECF_factors[factor] || 0;
    const weight = ECF_WEIGHTS[factor] || 1;
    EFactor += rating * weight;
  });
  ucp.EFactor = EFactor;
  ucp.ECF = 1.4 + (-0.03 * EFactor);
  
  // 6. Calculate UCP (Adjusted Use Case Points)
  ucp.UCP = ucp.UUCP * ucp.TCF * ucp.ECF;
  
  // 7. Calculate effort in hours
  ucp.effortHours = ucp.UCP * ucp.PF;
  
  // 8. Calculate cost
  ucp.cost = ucp.effortHours * session.project.hourlyRate;
  
  return ucp;
}

/**
 * Calculate combined estimate and generate summary
 */
export function generateSummary(session) {
  const project = session.project;
  const fpa = session.FPA;
  const ucp = session.UCP;
  const summary = session.summary;
  
  // Store individual values
  summary.fpaEffortHours = fpa.effortHours;
  summary.fpaEffortDays = (fpa.effortHours / 8).toFixed(1);
  summary.fpaCost = fpa.cost;
  
  summary.ucpEffortHours = ucp.effortHours;
  summary.ucpEffortDays = (ucp.effortHours / 8).toFixed(1);
  summary.ucpCost = ucp.cost;
  
  // Calculate combined estimate
  const combinedHours = (fpa.effortHours + ucp.effortHours) / 2;
  summary.combinedEffortHours = combinedHours.toFixed(0);
  summary.combinedEffortDays = (combinedHours / 8).toFixed(1);
  summary.combinedCost = (combinedHours * project.hourlyRate).toFixed(2);
  
  // Determine project size label
  const fpSize = fpa.FP || 0;
  const ucpSize = ucp.UCP || 0;
  
  if (fpSize < 100 && ucpSize < 50) {
    summary.projectSizeLabel = "Small";
  } else if (fpSize < 300 && ucpSize < 100) {
    summary.projectSizeLabel = "Medium";
  } else if (fpSize < 1000 && ucpSize < 300) {
    summary.projectSizeLabel = "Large";
  } else {
    summary.projectSizeLabel = "Very Large";
  }
  
  // Determine complexity label based on TCF and ECF
  const tcf = ucp.TCF || 0.6;
  const ecf = ucp.ECF || 1.4;
  const avgComplexity = (tcf + ecf) / 2;
  
  if (avgComplexity < 0.9) {
    summary.complexityLabel = "Low";
  } else if (avgComplexity < 1.0) {
    summary.complexityLabel = "Medium";
  } else if (avgComplexity < 1.1) {
    summary.complexityLabel = "High";
  } else {
    summary.complexityLabel = "Very High";
  }
  
  // Generate confidence note
  const notes = [];
  if (ecf < 0.9) {
    notes.push("Team environment factors may increase actual effort.");
  }
  if (tcf > 1.1) {
    notes.push("High technical complexity detected — add 15% buffer.");
  }
  if (ecf < 0.9 && tcf > 1.1) {
    notes.push("Consider a 20-25% risk buffer on this estimate.");
  }
  
  summary.confidenceNote = notes.length > 0 
    ? notes.join(" ") 
    : "Estimate confidence is moderate based on average complexity factors.";
  
  return summary;
}

/**
 * Full calculation pipeline
 */
export function performFullCalculation(session) {
  if (session.project.method === "FPA" || session.project.method === "BOTH") {
    calculateFPA(session);
  }
  
  if (session.project.method === "UCP" || session.project.method === "BOTH") {
    calculateUCP(session);
  }
  
  generateSummary(session);
  session.updatedAt = new Date().toISOString();
  
  return session;
}

// ════════════════════════════════════════════════════════════════
// SECTION 4: PDF REPORT GENERATION
// ════════════════════════════════════════════════════════════════

/**
 * Format report as plain text (suitable for PDF)
 */
export function formatReportAsText(session) {
  const project = session.project;
  const fpa = session.FPA;
  const ucp = session.UCP;
  const summary = session.summary;
  
  const lines = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "PROJECT ESTIMATION REPORT",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    `Project : ${project.name || "[name]"}`,
    `Description : ${project.description || "[description]"}`,
    `Team Size : ${project.teamSize || "[n]"} developers`,
    `Hourly Rate : ${project.hourlyRate || "[rate]"} ${project.currency || "[currency]"}`,
    "",
    "━━━━ FUNCTION POINT ANALYSIS ━━━━",
    `EI  : ${fpa.elements.EI.length} items → ${fpa.elements.EI.reduce((sum, e) => sum + (e.weight || 0), 0)} pts`,
    `EO  : ${fpa.elements.EO.length} items → ${fpa.elements.EO.reduce((sum, e) => sum + (e.weight || 0), 0)} pts`,
    `EQ  : ${fpa.elements.EQ.length} items → ${fpa.elements.EQ.reduce((sum, e) => sum + (e.weight || 0), 0)} pts`,
    `ILF : ${fpa.elements.ILF.length} items → ${fpa.elements.ILF.reduce((sum, e) => sum + (e.weight || 0), 0)} pts`,
    `EIF : ${fpa.elements.EIF.length} items → ${fpa.elements.EIF.reduce((sum, e) => sum + (e.weight || 0), 0)} pts`,
    `UFP = ${(fpa.UFP || 0).toFixed(0)}`,
    `ΣF  = ${(fpa.sumF || 0).toFixed(0)}  |  VAF = ${(fpa.VAF || 0).toFixed(3)}`,
    `FP  = ${(fpa.FP || 0).toFixed(1)}`,
    `Effort = ${(fpa.effortHours || 0).toFixed(0)} hours`,
    `Cost   = ${(fpa.cost || 0).toFixed(2)} ${project.currency || "[currency]"}`,
    "",
    "━━━━ USE CASE POINT ANALYSIS ━━━━",
    `UAW  = ${(ucp.UAW || 0).toFixed(0)}  (${ucp.actors.length} actors)`,
    `UUCW = ${(ucp.UUCW || 0).toFixed(0)}  (${ucp.useCases.length} use cases)`,
    `UUCP = ${(ucp.UUCP || 0).toFixed(0)}`,
    `TCF  = ${(ucp.TCF || 0).toFixed(3)}  (TFactor=${(ucp.TFactor || 0).toFixed(0)})`,
    `ECF  = ${(ucp.ECF || 0).toFixed(3)}  (EFactor=${(ucp.EFactor || 0).toFixed(0)})`,
    `UCP  = ${(ucp.UCP || 0).toFixed(1)}`,
    `PF   = ${(ucp.PF || 20).toFixed(0)} hrs/UCP`,
    `Effort = ${(ucp.effortHours || 0).toFixed(0)} hours`,
    `Cost   = ${(ucp.cost || 0).toFixed(2)} ${project.currency || "[currency]"}`,
    "",
    "━━━━ COMBINED ESTIMATE ━━━━",
    `Average Effort : ${(summary.combinedEffortHours || 0).toFixed(0)} hours`,
    `Average Cost   : ${(summary.combinedCost || 0).toFixed(2)} ${project.currency || "[currency]"}`,
    `Project Size   : ${summary.projectSizeLabel || "[Small/Medium/Large/Very Large]"}`,
    `Complexity     : ${summary.complexityLabel || "[Low/Medium/High/Very High]"}`,
    `Confidence Note: ${summary.confidenceNote || "[observation based on ECF/TCF values]"}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ];
  
  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════
// SECTION 5: UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function validateSession(session) {
  if (!session || typeof session !== "object") return false;
  if (!session.project || !session.FPA || !session.UCP) return false;
  return true;
}

export function cloneSession(session) {
  return JSON.parse(JSON.stringify(session));
}

export default {
  createEmptyEstimationSession,
  classifyFPAComplexity,
  getComplexityWeight,
  classifyActorComplexity,
  classifyUseCaseComplexity,
  calculateFPA,
  calculateUCP,
  generateSummary,
  performFullCalculation,
  formatReportAsText,
  validateSession,
  cloneSession,
  FPA_WEIGHTS,
  UCP_WEIGHTS,
  TCF_WEIGHTS,
  ECF_WEIGHTS
};
