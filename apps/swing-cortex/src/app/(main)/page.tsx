import { requireCoachActor } from "@/lib/auth";
import { loadSymptomTree, loadFrequentSymptoms, loadStudents } from "@/lib/data";
import { loadFeatures } from "@/lib/plan";
import DiagnosisClient from "./diagnosis-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const actor = await requireCoachActor();
  const features = await loadFeatures(actor.companyId);
  const [tree, frequent, students] = await Promise.all([
    loadSymptomTree(actor.companyId),
    loadFrequentSymptoms(actor.companyId),
    features.studentCrm ? loadStudents(actor.companyId) : Promise.resolve([]),
  ]);
  const chips = frequent.length ? frequent : tree.slice(0, 6).map((s) => s.symptomName);
  return (
    <DiagnosisClient
      coachName={actor.name}
      tree={tree}
      chips={chips}
      students={students}
      studentCrm={features.studentCrm}
    />
  );
}
