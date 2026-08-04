// One-off introspection route: can we pull historical visit notes and
// photos that were entered directly in Jobber (before this CRM's own
// visit_notes table existed) so they show up on the Customer page's
// Past Visits alongside notes/photos added going forward? Same
// throwaway pattern as schema-check.ts / invoice-schema-check.ts —
// delete once the real field names are confirmed and the real sync is
// built.
//
// Round 1: guessed type names (Note/Attachment/File/Photo) don't
// exist, but Visit/Job/Client all really do have a `notes` field
// (Job/Client also have `noteAttachments`).
//
// Round 2: walked `__schema.types` instead of guessing further.
// Visit.notes AND Job.notes both resolve to `JobNoteUnionConnection`
// — i.e. Jobber models these as notes on the JOB, not the visit.
//
// Round 3: JobNote's own fields (createdAt/createdBy/message/
// fileAttachments/linkedTo/pinned) have NO field pointing back to a
// specific visit. JobNoteFile has the actual photo URLs
// (url/downloadUrl/previewUrl/thumbnailUrl). Visit.notes DOES accept
// a `filter: NoteFilterAttributes` arg, though — worth checking
// whether that filter can narrow a job's notes down to one visit.
//
// Round 4: two things left before writing the real backfill —
// (a) does NoteFilterAttributes (or NoteLink, the `linkedTo` field's
// type) actually carry a visit reference we missed? (b) empirically,
// for a handful of real visits, does `visit.notes` return the SAME
// note IDs as `visit.job.notes`, or a genuinely narrower set? If
// they're identical, Jobber has no real per-visit note association at
// all, and the backfill will need to fall back to matching a note's
// createdAt to the nearest visit date for that job (the same kind of
// call already made for tip attribution in lib/tips.ts).
import { NextResponse } from "next/server";
import { jobberGraphQL } from "@/lib/jobber";

export const dynamic = "force-dynamic";

const TYPE_FRAGMENT = `
  name
  kind
  ofType {
    name
    kind
    ofType {
      name
      kind
    }
  }
`;

const INTROSPECTION_AND_SAMPLE_QUERY = `
  query NotesSchemaCheckRound4($limit: Int!) {
    filterInput: __type(name: "NoteFilterAttributes") {
      inputFields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
    }

    noteLinkType: __type(name: "NoteLink") {
      kind
      fields {
        name
        type {
          ${TYPE_FRAGMENT}
        }
      }
      possibleTypes {
        name
      }
    }

    visits(first: $limit) {
      nodes {
        id
        startAt

        job {
          id
          notes(first: 20) {
            edges {
              node {
                ... on JobNote {
                  id
                  message
                  createdAt
                }
              }
            }
          }
        }

        notes(first: 20) {
          edges {
            node {
              ... on JobNote {
                id
                message
                createdAt
                fileAttachments(first: 3) {
                  edges {
                    node {
                      id
                      fileName
                      contentType
                      url
                      downloadUrl
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

type InputField = { name: string; type: { name: string | null; kind: string; ofType: unknown } };
type FieldSummary = { name: string; type: { name: string | null; kind: string; ofType: unknown } };
type NoteFileNode = {
  id: string;
  fileName: string | null;
  contentType: string | null;
  url: string | null;
  downloadUrl: string | null;
};
type NoteNode = {
  id: string;
  message: string | null;
  createdAt: string | null;
  fileAttachments?: { edges: { node: NoteFileNode }[] };
};
type VisitSampleNode = {
  id: string;
  startAt: string | null;
  job: { id: string; notes: { edges: { node: NoteNode }[] } } | null;
  notes: { edges: { node: NoteNode }[] };
};

type Round4Response = {
  filterInput: { inputFields: InputField[] } | null;
  noteLinkType: { kind: string; fields: FieldSummary[] | null; possibleTypes: { name: string }[] | null } | null;
  visits: { nodes: VisitSampleNode[] } | null;
};

function resolveNamedType(type: { name: string | null; ofType: unknown } | null): string {
  let current = type as { name: string | null; ofType: unknown } | null;
  while (current) {
    if (current.name) return current.name;
    current = current.ofType as { name: string | null; ofType: unknown } | null;
  }
  return "?";
}

export async function GET() {
  try {
    const { data, errors } = await jobberGraphQL<Round4Response>(
      INTROSPECTION_AND_SAMPLE_QUERY,
      { limit: 5 }
    );

    if (errors?.length) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    const visits = data?.visits?.nodes ?? [];

    const comparison = visits.map((visit) => {
      const visitNoteIds = visit.notes.edges.map((e) => e.node.id).sort();
      const jobNoteIds = (visit.job?.notes.edges ?? []).map((e) => e.node.id).sort();

      return {
        visitId: visit.id,
        visitStartAt: visit.startAt,
        visitNoteCount: visitNoteIds.length,
        jobNoteCount: jobNoteIds.length,
        sameNoteIds: JSON.stringify(visitNoteIds) === JSON.stringify(jobNoteIds),
        sampleNotes: visit.notes.edges.slice(0, 2).map((e) => ({
          id: e.node.id,
          createdAt: e.node.createdAt,
          messagePreview: e.node.message?.slice(0, 60) ?? null,
          fileCount: e.node.fileAttachments?.edges.length ?? 0,
          sampleFile: e.node.fileAttachments?.edges[0]?.node ?? null,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      noteFilterAttributesFields: (data?.filterInput?.inputFields ?? []).map(
        (f) => `${f.name}: ${resolveNamedType(f.type)}`
      ),
      noteLinkType: {
        kind: data?.noteLinkType?.kind ?? null,
        possibleTypes: (data?.noteLinkType?.possibleTypes ?? []).map((t) => t.name),
        fields: (data?.noteLinkType?.fields ?? []).map((f) => `${f.name}: ${resolveNamedType(f.type)}`),
      },
      // Per sampled visit: does visit.notes return the exact same note
      // IDs as visit.job.notes, or a genuinely narrower set?
      visitVsJobNoteComparison: comparison,
    });
  } catch (error) {
    console.error("Jobber notes schema check failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown schema check error.",
      },
      { status: 500 }
    );
  }
}
