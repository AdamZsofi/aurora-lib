import { Paper } from "../types/paper"
import { deletePaper } from "../api/papers"

export function PapersTable({
  papers,
  onSelect,
}: {
  papers: Paper[]
  onSelect: (id: string) => void // now opens a tab in parent
}) {
  return (
    <table className="w-full border-collapse mt-3">
      <thead>
        <tr className="bg-zinc-100 dark:bg-zinc-800">
          <th className="px-3 py-2 text-left">Title</th>
          <th className="px-3 py-2 text-left">Authors</th>
          {/*<th className="px-3 py-2 text-left">DOI</th>*/}
          {/*<th className="px-3 py-2 text-left">Papis ID</th>*/}
          <th className="px-3 py-2 text-left">Actions</th>
        </tr>
      </thead>
      <tbody>
        {papers.map((p, i) => (
          <tr
            key={i}
            className="hover:bg-aurora-100 dark:hover:bg-aurora-300 cursor-pointer"
            onClick={() => onSelect(p.id || p.ref || "")}
          >
            <td className="px-3 py-2">{p.title || "(no title)"}</td>
            <td className="px-3 py-2">
              {Array.isArray(p.authors) ? p.authors.join(", ") : p.authors}
            </td>
            {/*<td className="px-3 py-2">{p.doi}</td>*/}
            {/*<td className="px-3 py-2">{p.id}</td>*/}
            <td className="px-3 py-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deletePaper(p.id || "")
                }}
                className="px-2 py-1 rounded bg-aurora-900 text-white"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
