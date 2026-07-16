import { useState } from "react";
import { CaretUpDown, Check, MagnifyingGlass } from "@phosphor-icons/react";
import { PARROT_SPECIES } from "@/lib/parrotSpecies";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

export default function SpeciesSelect({
    value,
    onChange,
    placeholder = "Välj eller sök art…",
    testid = "select-species",
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal h-10"
                    data-testid={testid}
                >
                    <span className={value ? "" : "text-muted-foreground"}>
                        {value || placeholder}
                    </span>
                    <CaretUpDown size={14} className="opacity-50 flex-shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
            >
                <Command>
                    <div className="flex items-center border-b border-border px-3">
                        <MagnifyingGlass size={14} className="text-muted-foreground" />
                        <CommandInput
                            placeholder="Sök art…"
                            className="h-10 border-0 focus:ring-0"
                            data-testid={`${testid}-search`}
                        />
                    </div>
                    <CommandList className="max-h-[320px]">
                        <CommandEmpty>Ingen art matchar.</CommandEmpty>
                        {PARROT_SPECIES.map((group) => (
                            <CommandGroup key={group.family} heading={group.family}>
                                {group.items.map((item) => (
                                    <CommandItem
                                        key={item}
                                        value={item}
                                        onSelect={() => {
                                            onChange(item);
                                            setOpen(false);
                                        }}
                                        data-testid={`species-option-${item.substring(0, 30)}`}
                                    >
                                        <Check
                                            size={14}
                                            className={`mr-2 ${
                                                value === item ? "opacity-100" : "opacity-0"
                                            }`}
                                        />
                                        <span className="text-sm">{item}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
