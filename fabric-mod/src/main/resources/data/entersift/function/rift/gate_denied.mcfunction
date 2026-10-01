# Explains why the rift gate refused, then returns 0 so the caller stops (punch never costs souls by day).
execute if dimension entersift:the_sift run title @s actionbar {"text":"Rifts open only during Endure in the Sift.","color":"dark_purple"}
execute unless dimension entersift:the_sift run title @s actionbar {"text":"Rifts open only at night.","color":"dark_purple"}
return 0
