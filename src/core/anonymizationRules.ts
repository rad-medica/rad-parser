/**
 * DICOM Basic Attribute Confidentiality Profile (PS3.15 Annex E)
 *
 * Actions:
 * X: Remove (Delete)
 * Z: Zero Length or Empty Value
 * D: Dummy Value
 * U: Replace with new UID
 * K: Keep (if safe private option is not used, private tags are commonly removed)
 * C: Clean (not fully implemented, treated as X or D)
 */

export type AnonymizationAction = "X" | "Z" | "D" | "U" | "K";

export interface AnonymizationRule {
    tag: string; // xGGGGEEEE format
    name: string;
    action: AnonymizationAction;
}

// Minimal subset of Basic Profile tags for Demonstration/Compliance
// In a real scenario this list would be 200+ tags.
// Using x-prefix format.
export const BASIC_PROFILE_RULES: Record<string, AnonymizationRule> = {
    // Group 0008
    x00080018: { tag: "x00080018", name: "SOPInstanceUID", action: "U" },
    x00080050: { tag: "x00080050", name: "AccessionNumber", action: "Z" },
    x00080080: { tag: "x00080080", name: "InstitutionName", action: "X" },
    x00080081: { tag: "x00080081", name: "InstitutionAddress", action: "X" },
    x00080090: {
        tag: "x00080090",
        name: "ReferringPhysicianName",
        action: "Z",
    },
    x00080092: {
        tag: "x00080092",
        name: "ReferringPhysicianAddress",
        action: "X",
    },
    x00080094: {
        tag: "x00080094",
        name: "ReferringPhysicianTelephoneNumbers",
        action: "X",
    },
    x00081010: { tag: "x00081010", name: "StationName", action: "X" },
    x00081030: { tag: "x00081030", name: "StudyDescription", action: "X" }, // Often kept but clean? Profile says X/Z/D
    x0008103E: { tag: "x0008103E", name: "SeriesDescription", action: "X" },
    x00081040: {
        tag: "x00081040",
        name: "InstitutionalDepartmentName",
        action: "X",
    },
    x00081048: { tag: "x00081048", name: "PhysiciansOfRecord", action: "X" },
    x00081050: {
        tag: "x00081050",
        name: "PerformingPhysicianName",
        action: "X",
    },
    x00081060: {
        tag: "x00081060",
        name: "NameOfPhysiciansReadingStudy",
        action: "X",
    },
    x00081070: { tag: "x00081070", name: "OperatorsName", action: "X" },
    x00081080: {
        tag: "x00081080",
        name: "AdmittingDiagnosesDescription",
        action: "X",
    },
    x00081155: {
        tag: "x00081155",
        name: "ReferencedSOPInstanceUID",
        action: "U",
    },
    x00082111: { tag: "x00082111", name: "DerivationDescription", action: "X" },

    // Group 0010 (Patient)
    x00100010: { tag: "x00100010", name: "PatientName", action: "D" },
    x00100020: { tag: "x00100020", name: "PatientID", action: "D" }, // or U/D? Profile says D.
    x00100030: { tag: "x00100030", name: "PatientBirthDate", action: "Z" },
    x00100032: { tag: "x00100032", name: "PatientBirthTime", action: "Z" },
    x00100040: { tag: "x00100040", name: "PatientSex", action: "Z" },
    x00101000: { tag: "x00101000", name: "OtherPatientIDs", action: "X" },
    x00101001: { tag: "x00101001", name: "OtherPatientNames", action: "X" },
    x00101040: { tag: "x00101040", name: "PatientAddress", action: "X" },
    x00102160: { tag: "x00102160", name: "EthnicGroup", action: "X" },
    x00102180: { tag: "x00102180", name: "Occupation", action: "X" },
    x001021B0: {
        tag: "x001021B0",
        name: "AdditionalPatientHistory",
        action: "X",
    },
    x00104000: { tag: "x00104000", name: "PatientComments", action: "X" },

    // Group 0018
    x00181000: { tag: "x00181000", name: "DeviceSerialNumber", action: "X" },
    x00181030: { tag: "x00181030", name: "ProtocolName", action: "X" },

    // Group 0020
    x0020000D: { tag: "x0020000D", name: "StudyInstanceUID", action: "U" },
    x0020000E: { tag: "x0020000E", name: "SeriesInstanceUID", action: "U" },
    x00200010: { tag: "x00200010", name: "StudyID", action: "Z" },
    x00200052: { tag: "x00200052", name: "FrameOfReferenceUID", action: "U" },
    x00200200: {
        tag: "x00200200",
        name: "SynchronizationFrameOfReferenceUID",
        action: "U",
    },
    x00204000: { tag: "x00204000", name: "ImageComments", action: "X" },

    // Group 0040
    x00400275: { tag: "x00400275", name: "RequestingPhysician", action: "X" },

    // ... Add more as needed for strict compliance
};

// Helper: Check if a tag is a UID tag that needs replacement
export function isUIDTag(tag: string): boolean {
    return BASIC_PROFILE_RULES[tag]?.action === "U";
}
