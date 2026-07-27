"use client";

import { useState } from "react";
import { addCostInput } from "./actions";
import { OVERHEAD_CATEGORY_OPTIONS } from "./constants";

type EntityType = "material" | "labor" | "equipment" | "overhead";

const ENTITY_LABELS: Record<EntityType, string> = {
  material: "Material",
  labor: "Labor Rate",
  equipment: "Equipment",
  overhead: "Overhead Cost",
};

const inputClasses =
  "mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";
const labelClasses = "text-xs font-bold text-[#9c7a20]";

export default function AddCostInputForm() {
  const [entityType, setEntityType] = useState<EntityType>("material");

  return (
    <form action={addCostInput} className="mt-4 space-y-4">
      <div className="sm:w-64">
        <label htmlFor="entity_type" className={labelClasses}>
          What are you adding?
        </label>
        <select
          id="entity_type"
          name="entity_type"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value as EntityType)}
          className={`${inputClasses} bg-white`}
        >
          {(Object.keys(ENTITY_LABELS) as EntityType[]).map((type) => (
            <option key={type} value={type}>
              {ENTITY_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-[#eee9dc] pt-4">
        {entityType === "material" && <MaterialFields />}
        {entityType === "labor" && <LaborFields />}
        {entityType === "equipment" && <EquipmentFields />}
        {entityType === "overhead" && <OverheadFields />}
      </div>

      <button
        type="submit"
        className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
      >
        Add {ENTITY_LABELS[entityType]}
      </button>
    </form>
  );
}

function MaterialFields() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="name" className={labelClasses}>
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. OxyTurf"
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="unit_label" className={labelClasses}>
            Unit
          </label>
          <input
            id="unit_label"
            name="unit_label"
            type="text"
            required
            placeholder="e.g. gallon, bag"
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="unit_cost" className={labelClasses}>
            Cost per Unit ($)
          </label>
          <input
            id="unit_cost"
            name="unit_cost"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClasses}
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className={labelClasses}>
          Notes
        </label>
        <input
          id="notes"
          name="notes"
          type="text"
          placeholder="Optional — e.g. last purchased 275-gal tote for $3,717.50"
          className={inputClasses}
        />
      </div>
    </div>
  );
}

function LaborFields() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="employee_name" className={labelClasses}>
          Employee Name
        </label>
        <input
          id="employee_name"
          name="employee_name"
          type="text"
          required
          placeholder="e.g. Jordan"
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="hourly_rate" className={labelClasses}>
          Hourly Rate ($)
        </label>
        <input
          id="hourly_rate"
          name="hourly_rate"
          type="number"
          step="0.01"
          min="0"
          required
          className={inputClasses}
        />
      </div>
    </div>
  );
}

function EquipmentFields() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="equipment_name" className={labelClasses}>
            Name
          </label>
          <input
            id="equipment_name"
            name="name"
            type="text"
            required
            placeholder="e.g. Turf Vacuum"
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="total_cost" className={labelClasses}>
            Purchase Price ($)
          </label>
          <input
            id="total_cost"
            name="total_cost"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="in_service_date" className={labelClasses}>
            In Service Date
          </label>
          <input
            id="in_service_date"
            name="in_service_date"
            type="date"
            required
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="retired_date" className={labelClasses}>
            Retirement Date{" "}
            <span className="font-normal text-[#6b705c]">(optional)</span>
          </label>
          <input
            id="retired_date"
            name="retired_date"
            type="date"
            className={inputClasses}
          />
        </div>
      </div>

      <div>
        <label htmlFor="equipment_notes" className={labelClasses}>
          Notes
        </label>
        <input
          id="equipment_notes"
          name="notes"
          type="text"
          placeholder="Optional"
          className={inputClasses}
        />
      </div>
    </div>
  );
}

function OverheadFields() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="overhead_name" className={labelClasses}>
            Name
          </label>
          <input
            id="overhead_name"
            name="name"
            type="text"
            required
            placeholder="e.g. Jobber Subscription"
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="category" className={labelClasses}>
            Category
          </label>
          <select
            id="category"
            name="category"
            className={`${inputClasses} bg-white`}
          >
            {OVERHEAD_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="cost_type" className={labelClasses}>
            Type
          </label>
          <select
            id="cost_type"
            name="cost_type"
            className={`${inputClasses} bg-white`}
          >
            <option value="recurring">Recurring monthly</option>
            <option value="amortized">Amortized over a date range</option>
          </select>
        </div>

        <div>
          <label htmlFor="amount" className={labelClasses}>
            Amount ($)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="Monthly for recurring, total for amortized"
            className={inputClasses}
          />
        </div>

        <div />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="start_date" className={labelClasses}>
            Start Date
          </label>
          <input
            id="start_date"
            name="start_date"
            type="date"
            required
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="end_date" className={labelClasses}>
            End Date{" "}
            <span className="font-normal text-[#6b705c]">
              (leave blank if ongoing; required for amortized)
            </span>
          </label>
          <input id="end_date" name="end_date" type="date" className={inputClasses} />
        </div>
      </div>

      <div>
        <label htmlFor="overhead_notes" className={labelClasses}>
          Notes
        </label>
        <input
          id="overhead_notes"
          name="notes"
          type="text"
          placeholder="Optional"
          className={inputClasses}
        />
      </div>
    </div>
  );
}
