<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns4:modelInfo name="QDM" url="urn:healthit-gov:qdm:v4_1_2" targetQualifier="qdm" xmlns:ns4="urn:hl7-org:elm-modelinfo:r1" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               patientClassName="QDM.Patient" patientClassIdentifier="Patient" patientBirthDatePropertyName="birth datetime" schemaLocation="http://gov.healthit.qdm qdm.xsd">
    <ns4:typeInfo xsi:type="ns4:ClassInfo" name="QDM.Patient" baseType="System.Any" identifier="Patient">
        <ns4:element name="birth datetime" type="System.DateTime"/>
    </ns4:typeInfo>
    <ns4:typeInfo xsi:type="ns4:ClassInfo" name="QDM.DiagnosisActive" baseType="QDM.QDMBaseType"
                  retrievable="true" label="Diagnosis, Active" identifier="DiagnosisActive" primaryCodePath="code">
        <ns4:element name="anatomical location" type="System.Concept"/>
        <ns4:element name="laterality" type="System.Concept"/>
        <ns4:element name="severity" type="System.Concept"/>
        <ns4:element name="ordinality" type="System.Concept"/>
    </ns4:typeInfo>
    <ns4:typeInfo xsi:type="ns4:ClassInfo" name="QDM.LaboratoryTestPerformed" baseType="QDM.QDMBaseType"
                  retrievable="true" label="Laboratory Test, Performed" identifier="LaboratoryTestPerformed" primaryCodePath="code">
        <ns4:element name="status" type="System.Concept"/>
        <ns4:element name="method" type="System.Concept"/>
        <ns4:element name="result" type="System.Any"/>
        <ns4:element name="result code" type="System.Concept"/>
        <ns4:element name="result value" type="System.Quantity"/>
        <ns4:element name="reason" type="System.Concept"/>
    </ns4:typeInfo>
    <ns4:typeInfo xsi:type="ns4:ClassInfo" name="QDM.EncounterPerformed" baseType="QDM.QDMBaseType"
                  retrievable="true" label="Encounter, Performed" identifier="EncounterPerformed" primaryCodePath="code">
        <ns4:element name="admission datetime" type="System.DateTime"/>
        <ns4:element name="discharge datetime" type="System.DateTime"/>
        <ns4:element name="discharge status" type="System.Concept"/>
        <ns4:element name="facility location" type="System.Concept"/>
        <ns4:element name="facility location arrival datetime" type="System.DateTime"/>
        <ns4:element name="facility location departure datetime" type="System.DateTime"/>
        <ns4:element name="length of stay" type="System.Quantity"/>
        <ns4:element name="reason" type="System.Concept"/>
    </ns4:typeInfo>
    <ns4:typeInfo xsi:type="ns4:ClassInfo" name="QDM.QDMBaseType" baseType="System.Any">
        <ns4:element name="code" type="System.Concept"/>
        <ns4:element name="start datetime" type="System.DateTime"/>
        <ns4:element name="stop datetime" type="System.DateTime"/>
        <ns4:element name="negation rationale" type="System.Concept"/>
        <ns4:element name="patient preference" type="System.Concept"/>
        <ns4:element name="provider preference" type="System.Concept"/>
    </ns4:typeInfo>
    <ns4:typeInfo xsi:type="ns4:ClassInfo" name="QDM.MedicationOrder" baseType="QDM.QDMBaseType"
                  retrievable="true" label="Medication, Order" identifier="MedicationOrder" primaryCodePath="code">
        <ns4:element name="active datetime" type="System.DateTime"/>
        <ns4:element name="signed datetime" type="System.DateTime"/>
        <ns4:element name="refills" type="System.Integer"/>
        <ns4:element name="dose" type="System.Quantity"/>
        <ns4:element name="frequency" type="System.Concept"/>
        <ns4:element name="route" type="System.Concept"/>
        <ns4:element name="method" type="System.Concept"/>
        <ns4:element name="reason" type="System.Concept"/>
        <ns4:element name="cumulative medication duration" type="System.Quantity"/>
    </ns4:typeInfo>
</ns4:modelInfo>