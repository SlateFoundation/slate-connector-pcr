<?php

namespace Slate\Connectors\PCR;

use SpreadsheetReader;
use Emergence\Connectors\IJob;
use Emergence\Connectors\Exceptions\RemoteRecordInvalid;

use Slate\Term;
use Slate\Courses\Section;


class Connector extends \Slate\Connectors\AbstractSpreadsheetConnector implements \Emergence\Connectors\ISynchronize
{
    // column maps
    public static $personForeignKeyName = 'student[alternate_id]';
    public static $studentColumns = [
        // old PCR fields
        'alternate id' => 'ForeignKey',
        'student id' => 'StudentNumber',
        'student nickname' => 'PreferredName',
        'student first name' => 'FirstName',
        'student middle name' => 'MiddleName',
        'student last name' => 'LastName',
        'sex' => 'Gender',
        'year grad' => 'GraduationYear',
        'advisor first name' => 'AdvisorFirstName',
        'advisor last name' => 'AdvisorLastName',

        // new PCR fields
        'Alternate Id' => 'ForeignKey',
        'Student Id' => 'StudentNumber',
        'Student Nickname' => 'PreferredName',
        'Student First Name' => 'FirstName',
        'Student Middle Name' => 'MiddleName',
        'Student Last Name' => 'LastName',
        'Sex' => 'Gender',
        'Year Grad' => 'GraduationYear',
        'Advisor First Name' => 'AdvisorFirstName',
        'Advisor Last Name' => 'AdvisorLastName'
    ];

    public static $sectionForeignKeyName = 'section_id';
    public static $sectionColumns = [
        // old PCR fields
        'semester' => 'SemesterNumber',
        'course name' => 'CourseTitle',
        'short course name' => 'CourseCode',
        'section capacity' => 'StudentsCapacity',
        'course id' => 'CourseExternal',
        'period code' => 'Schedule',
        'department name' => 'DepartmentTitle',
        'section' => 'SectionNumber',
        'teacher first name' => 'TeacherFirstName',
        'teacher last name' => 'TeacherLastName',
        'room' => 'Location',

        // new PCR fields
        'Semester' => 'SemesterNumber',
        'Course Name' => 'CourseTitle',
        'Short Course Name' => 'CourseCode',
        'Section Capacity' => 'StudentsCapacity',
        'Course Id' => 'CourseExternal',
        'Period Code' => 'Schedule',
        'Department Name' => 'DepartmentTitle',
        'Section' => 'SectionNumber',
        'Teacher First Name' => 'TeacherFirstName',
        'Teacher Last Name' => 'TeacherLastName',
        'Room' => 'Location'
    ];

    public static $enrollmentColumns = [
        // old PCR fields
        'student id' => 'StudentNumber',
        'course id' => 'CourseExternal',
        'section' => 'SectionNumber',

        // new PCR fields
        'Student Id' => 'StudentNumber',
        'Course Id' => 'CourseExternal',
        'Section' => 'SectionNumber'
    ];

    // AbstractConnector overrides
    public static $title = 'PCR';
    public static $connectorId = 'pcr';


    // workflow implementations
    protected static function _getJobConfig(array $requestData)
    {
        $config = parent::_getJobConfig($requestData);

        $config['updatePasswords'] = false;
        $config['updateAbout'] = false;
        $config['matchFullNames'] = false;
        $config['autoAssignEmail'] = true;

        $config['studentsCsv'] = !empty($_FILES['students']) && $_FILES['students']['error'] === UPLOAD_ERR_OK ? $_FILES['students']['tmp_name'] : null;
        $config['sectionsCsv'] = !empty($_FILES['sections']) && $_FILES['sections']['error'] === UPLOAD_ERR_OK ? $_FILES['sections']['tmp_name'] : null;
        $config['schedulesCsv'] = !empty($_FILES['schedules']) && $_FILES['schedules']['error'] === UPLOAD_ERR_OK ? $_FILES['schedules']['tmp_name'] : null;

        return $config;
    }

    public static function synchronize(IJob $Job, $pretend = true)
    {
        if ($Job->Status != 'Pending' && $Job->Status != 'Completed') {
            return static::throwError('Cannot execute job, status is not Pending or Complete');
        }


        // update job status
        $Job->Status = 'Pending';

        if (!$pretend) {
            $Job->save();
        }


        // init results struct
        $results = [];


        // execute tasks based on available spreadsheets
        if (!empty($Job->Config['studentsCsv'])) {
            $results['pull-students'] = static::pullStudents(
                $Job,
                SpreadsheetReader::createFromStream(fopen($Job->Config['studentsCsv'], 'r')),
                $pretend
            );
        }

        if (!empty($Job->Config['sectionsCsv'])) {
            $results['pull-sections'] = static::pullSections(
                $Job,
                SpreadsheetReader::createFromStream(fopen($Job->Config['sectionsCsv'], 'r')),
                $pretend
            );
        }

        if (!empty($Job->Config['schedulesCsv'])) {
            $results['pull-enrollments'] = static::pullEnrollments(
                $Job,
                SpreadsheetReader::createFromStream(fopen($Job->Config['schedulesCsv'], 'r')),
                $pretend
            );
        }

        // save job results
        $Job->Status = 'Completed';
        $Job->Results = $results;

        if (!$pretend) {
            $Job->save();
        }

        return true;
    }

    protected static function _readSection(IJob $Job, array $row)
    {
        $row = parent::_readSection($Job, $row);

        if (empty($row['SectionExternal']) && !empty($row['CourseExternal']) && !empty($row['SectionNumber'])) {
            $row['SectionExternal'] = sprintf('%u:%u', $row['CourseExternal'], $row['SectionNumber']);
        }

        return $row;
    }

    protected static function _readEnrollment(IJob $Job, array $row)
    {
        $row = parent::_readEnrollment($Job, $row);

        if (!empty($row['CourseExternal']) && !empty($row['SectionNumber'])) {
            $row['_rest'] = [sprintf('%u:%u', $row['CourseExternal'], $row['SectionNumber'])];
        }

        return $row;
    }

    protected static function _applySectionChanges(IJob $Job, Term $MasterTerm, Section $Section, array $row)
    {
        if (!empty($row['SemesterNumber'])) {
            if (!$Term = Term::getByHandle('s'.substr($MasterTerm->Handle, 1).'-'.$row['SemesterNumber'])) {
                throw new RemoteRecordInvalid(
                    'term-not-found-for-semester-number',
                    sprintf('Term not found for semester number "%s"', $row['SemesterNumber']),
                    $row,
                    $row['SemesterNumber']
                );
            }

            // detect mergable adjacent terms
            if ($Term && $Section->Term && ($Term->Right+1 == $Section->Term->Left || $Term->Left == $Section->Term->Right+1)) {
                $ParentTerm = Term::getByWhere([
                    'Left' => min($Term->Left, $Section->Term->Left) - 1,
                    'Right' => max($Term->Right, $Section->Term->Right) + 1
                ]);

                if ($ParentTerm) {
                    $Term = $ParentTerm;
                }
            }

            // detect if existing course is set to a parent term
            if ($Term && $Section->Term && ($Term->Left > $Section->Term->Left) && ($Term->Right < $Section->Term->Right) ) {
                $Term = $Section->Term;
            }

            if ($Term) {
                $Section->Term = $Term;
            }
        }

        parent::_applySectionChanges($Job, $MasterTerm, $Section, $row);
    }
}
