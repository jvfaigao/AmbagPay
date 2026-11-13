import { Link } from "react-router-dom";
import { Card, Chip, Eyebrow } from "./ui";
import { COLLECTION_STATUS } from "../lib/contracts";
import { peso } from "../lib/format";
import { useCollections } from "../lib/useCollections";

/** The other fees of the org, so a member who came in through one QR can pay the rest. Hidden when there is only one fee. */
export default function FeeList({ currentId, member }: { currentId: bigint; member?: `0x${string}` }) {
  const { collections } = useCollections(member);
  const others = collections.filter((c) => c.id !== currentId);
  if (others.length === 0) return null;

  return (
    <Card className="flex flex-col gap-1 px-4 py-3">
      <Eyebrow>Iba pang fees</Eyebrow>
      <ul className="flex flex-col">
        {others.map((c) => (
          <li key={c.id.toString()}>
            <Link
              to={`/pay/${c.id}`}
              className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm last:border-b-0 focus-visible:outline-2 focus-visible:outline-green"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-dark">{c.name}</span>
                <span className="text-xs text-muted">{peso(c.amountPerMember)}</span>
              </span>
              {c.paid ? (
                <Chip tone="green">Paid ✓</Chip>
              ) : c.status === COLLECTION_STATUS.Closed ? (
                <Chip tone="neutral">Closed</Chip>
              ) : (
                <Chip tone="neutral">{member ? "Not yet · Pay ›" : "Pay ›"}</Chip>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
