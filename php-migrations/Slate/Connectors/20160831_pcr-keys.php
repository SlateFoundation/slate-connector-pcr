<?php

use Emergence\Connectors\Mapping;


// skip conditions
if (!static::tableExists(Mapping::$tableName)) {
    printf("Skipping migration because table `%s` does not exist yet\n", Mapping::$tableName);
    return static::STATUS_SKIPPED;
}


// migration
$affectedRows = 0;

DB::nonQuery(
    'UPDATE `%s` SET Connector = "pcr" WHERE Connector = "PCRIntegrator"',
    Mapping::$tableName
);
printf("Changed column `Connector` from 'PCRIntegrator' to 'pcr' in %u rows\n", DB::affectedRows());
$affectedRows += DB::affectedRows();

DB::nonQuery(
    'UPDATE `%s` SET ExternalKey = "student[alternate_id]" WHERE ExternalKey = "alternate_id" AND Connector = "pcr"',
    Mapping::$tableName
);
printf("Changed column `ExternalKey` from 'alternate_id' to 'student[alternate_id]' in %u rows\n", DB::affectedRows());
$affectedRows += DB::affectedRows();


// done
return $affectedRows > 0 ? static::STATUS_EXECUTED : static::STATUS_SKIPPED;